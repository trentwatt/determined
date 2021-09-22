FROM determinedai/environments:cuda-11.1-pytorch-1.9-lightning-1.3-tf-2.4-gpu-35cccd2

# Install deepspeed & dependencies
RUN apt-get install -y pdsh
RUN pip install ninja psutil packaging attrdict

ARG ALWAYS_RUN
RUN git clone https://github.com/determined-ai/deepspeed
WORKDIR /deepspeed
RUN git checkout determined
RUN python setup.py install
