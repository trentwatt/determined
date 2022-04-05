// @ts-nocheck
import React, { useEffect, useMemo, useRef } from 'react';
import { throttle } from 'throttle-debounce';
import uPlot, { AlignedData } from 'uplot';

import Message, { MessageType } from 'components/Message';
import useResize from 'hooks/useResize';
import { RecordKey } from 'types';
import { distance } from 'utils/chart';

import { FacetedData, UPlotData } from './types';

export interface Options extends Omit<uPlot.Options, 'width'> {
  width?: number;
}

interface Props {
  data?: AlignedData | FacetedData;
  focusIndex?: number;
  options?: Partial<Options>;
  style?: React.CSSProperties;
}

interface ScaleZoomData {
  isZoomed?: boolean;
  max?: number;
  min?: number;
}

const SCROLL_THROTTLE_TIME = 500;

const UPlotChart: React.FC<Props> = ({ data, focusIndex, options, style }: Props) => {
  const chartRef = useRef<uPlot>();
  const chartDivRef = useRef<HTMLDivElement>(null);
  const scalesRef = useRef<Record<RecordKey, uPlot.Scale>>();
  const scalesZoomData = useRef<Record<string, ScaleZoomData>>({});
  const isZoomed = useRef<boolean>(false);
  const mousePosition = useRef<[number, number]>();
  // console.log('renderplot');
  const ser = options.series.slice(2, 5).map(s => s.label?.slice(0, 16) ?? '').filter(x => !!x).join(' ');
  // console.log({ ser: options.series.reduce((s, acc) => [ s.label ?? '', acc ].join(' '), '') });
  // ) });
  console.log({ isZoomed: isZoomed.current, ser, zoomData: scalesZoomData.current?.x?.isZoomed || scalesZoomData.current?.y?.isZoomed });
  // console.log(data, focusIndex, options, style);

  const [ hasData, normalizedData ] = useMemo(() => {
    if (!data || data.length < 2) return [ false, undefined ];

    // Is the chart aligned (eg. linear) or faceted (eg. scatter plot)?
    if (options?.mode === 2) {
      return [ true, data as AlignedData ];
    } else {
      // Figure out the lowest sized series data.
      const chartData = data as AlignedData;
      const minDataLength = chartData.reduce((acc: number, series: UPlotData[]) => {
        return Math.min(acc, series.length);
      }, Number.MAX_SAFE_INTEGER);

      // Making sure the X series and all the other series data are the same length;
      const trimmedData = chartData.map(series => series.slice(0, minDataLength));

      // Checking to make sure the X series has some data.
      const hasXValues = trimmedData?.[0]?.length !== 0;

      return [ hasXValues, trimmedData as unknown as AlignedData ];
    }
  }, [ data, options?.mode ]);

  /*
   * Chart mount and dismount.
   */
  useEffect(() => {
    // console.log(scalesRef.current);
    // console.log({ options });

    // console.log(chartDivRef, hasData, JSON.stringify(options));
    if (!chartDivRef.current || !hasData || !options) return;

    const optionsExtended = uPlot.assign(
      {
        hooks: {
          ready: [ (chart: uPlot) => {
            chartRef.current = chart;
          } ],
          setScale: [ (uPlot: uPlot, scaleKey: string) => {
            console.log('scale set');
            const currentMax = uPlot.posToVal(scaleKey === 'x' ? uPlot.bbox.width : 0, scaleKey);
            const currentMin = uPlot.posToVal(scaleKey === 'x' ? 0 : uPlot.bbox.height, scaleKey);
            let max = scalesZoomData.current[scaleKey]?.max;
            let min = scalesZoomData.current[scaleKey]?.min;

            if (max == null || currentMax > max) max = currentMax;
            if (min == null || currentMin < min) min = currentMin;

            scalesZoomData.current[scaleKey] = { isZoomed: isZoomed.current, max, min };

            /*
             * Save the scale info if zoomed in and clear it otherwise.
             * This info will be used to restore the zoom when remounting
             * the chart, which can be caused by new series data, chart option
             * changes, etc.
             */
            if (!scalesRef.current) scalesRef.current = {};

            scalesRef.current[scaleKey] = uPlot.scales[scaleKey];

            if (Object.keys(scalesRef.current).length === 0) scalesRef.current = undefined;
          } ],
        },
        scales: scalesRef.current,
        width: chartDivRef.current.offsetWidth,
      },
      options,
    ) as uPlot.Options;

    const plotChart = new uPlot(optionsExtended, [], chartDivRef.current);

    return () => {
      console.log('chart destroy');
      plotChart.destroy();
      chartRef.current = undefined;
    };
    // eslint-disable-next-linez
  }, [ chartDivRef ]);
  // }, [ chartDivRef, hasData, options, normalizedData ]);

  /*
   * Chart data when data changes.
   */
  useEffect(() => {
    if (!chartRef.current || !normalizedData) return;
    // console.log('data hook');
    // let bool = isZoomed.current;
    const bool = false;
    chartRef.current.setData(normalizedData, hasData);
  }, [ hasData, normalizedData ]);
  //
  /*
   * When a focus index is provided, highlight applicable series.
   */
  useEffect(() => {
    if (!chartRef.current) return;
    const hasFocus = focusIndex !== undefined;
    chartRef.current.setSeries(hasFocus ? focusIndex as number + 1 : null, { focus: hasFocus });
  }, [ focusIndex ]);

  /*
   * Resize the chart when resize events happen.
   */
  const resize = useResize(chartDivRef);
  useEffect(() => {
    if (!chartRef.current) return;
    const [ width, height ] = [ resize.width, options?.height || chartRef.current.height ];
    if (chartRef.current.width === width && chartRef.current.height === height) return;
    chartRef.current.setSize({ height, width });
  }, [ options?.height, resize ]);

  /*
   * Resync the chart when scroll events happen to correct the cursor position upon
   * a parent container scrolling.
   */
  useEffect(() => {
    const throttleFunc = throttle(SCROLL_THROTTLE_TIME, () => {
      if (chartRef.current) chartRef.current.syncRect();
    });
    const handleScroll = () => throttleFunc();

    /*
     * The true at the end is the important part,
     * it tells the browser to capture the event on dispatch,
     * even if that event does not normally bubble, like change, focus, and scroll.
     */
    document.addEventListener('scroll', handleScroll, true);

    return () => {
      document.removeEventListener('scroll', handleScroll);
      throttleFunc.cancel();
    };
  }, []);

  return (
    <div ref={chartDivRef} style={style}>
      {!hasData && (
        <Message
          style={{ height: options?.height ?? 'auto' }}
          title="No data to plot."
          type={MessageType.Empty}
        />
      )}
    </div>
  );
};

const propsAreEqual = ((
  {
    data: prevData,
    focusIndex: prevFocusIndex,
    options: prevOptions,
    style: prevStyle,
  }: Props,
  {
    data: nextData,
    focusIndex: nextFocusIndex,
    options: nextOptions,
    style: nextStyle,
  } : Props,
) => {
  const dataAreEqual = prevData.length === nextData.length;
  const optionsAreEqual = JSON.stringify(prevOptions) === JSON.stringify(nextOptions);
  const focusIndicesAreEqual = JSON.stringify(prevFocusIndex) === JSON.stringify(nextFocusIndex);
  const stylesAreEqual = JSON.stringify(prevStyle) === JSON.stringify(nextStyle);
  const propsAreEqual = dataAreEqual && optionsAreEqual && focusIndicesAreEqual && stylesAreEqual;
  console.log(propsAreEqual);
  return propsAreEqual;
});

export default UPlotChart;
// export default React.memo(UPlotChart, propsAreEqual);
