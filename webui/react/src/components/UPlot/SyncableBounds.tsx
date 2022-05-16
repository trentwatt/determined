import React, {
  createContext,
  MutableRefObject,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import uPlot from 'uplot';

import { UPlotData } from './types';
interface SyncContext {
  setZoomed: (zoomed: boolean) => void;
  syncRef: MutableRefObject<uPlot.SyncPubSub>;
  zoomed : boolean
}

interface SyncableBounds {
  boundsOptions: Partial<uPlot.Options>;
  setZoomed: (zoomed: boolean) => void;
  zoomed: boolean;
}

const SyncContext = createContext<SyncContext|undefined>(undefined);

export const SyncProvider: React.FC = ({ children }) => {
  const syncRef = useRef(uPlot.sync('x'));
  const [ zoomed, setZoomed ] = useState(false);

  useEffect(() => {
    if(!zoomed) {
      syncRef.current.plots.forEach((chart: uPlot) => {
        chart.setData(chart.data, true);
      });
    }
  }, [ zoomed ]);

  return (
    <SyncContext.Provider
      value={{ setZoomed, syncRef, zoomed }}>
      {children}
    </SyncContext.Provider>
  );
};

export const useSyncableBounds = (): SyncableBounds => {
  const [ zoomed, setZoomed ] = useState(false);
  const mouseX = useRef<number|undefined>(undefined);
  const syncContext = useContext(SyncContext);
  const zoomSetter = syncContext?.setZoomed ?? setZoomed;
  const syncRef: MutableRefObject<uPlot.SyncPubSub> | undefined = syncContext?.syncRef;

  const boundsOptions = useMemo(() => ({
    cursor: {
      bind: {
        dblclick: (chart: uPlot, _target: EventTarget, handler: (e: MouseEvent) => void) => {
          return (e: MouseEvent) => {
            handler(e);
            zoomSetter(false);
            return null;
          };
        },
        mousedown: (_uPlot: uPlot, _target: EventTarget, handler: (e: MouseEvent) => null) => {
          return (e: MouseEvent) => {
            const mouseEvent = e as MouseEvent;
            mouseX.current = mouseEvent.clientX;
            handler(e);
            return null;
          };
        },
        mouseup: (_uPlot: uPlot, _target: EventTarget, handler: (e: MouseEvent) => null) => {
          return (e: MouseEvent) => {
            const mouseEvent = e as MouseEvent;
            if (mouseX.current != null) {
              handler(e);
            }
            if (mouseX.current != null && Math.abs(mouseEvent.clientX - mouseX.current) > 5) {
              zoomSetter(true);
            }
            mouseX.current = undefined;
            handler(e);
            return null;
          } ;
        },

      },
      drag: { dist: 5, uni: 10, x: true },
      sync: syncRef && {
        key: syncRef.current.key,
        scales: [ syncRef.current.key, null ],
        setSeries: false,
      },
    },
  }), [ zoomSetter, syncRef ]) as Partial<uPlot.Options>;

  return syncContext ? { ...syncContext, boundsOptions } : { boundsOptions, setZoomed, zoomed };
};
