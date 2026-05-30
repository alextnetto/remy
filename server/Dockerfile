FROM dailyco/pipecat-base:latest

# Bytecode compilation + copy mode (mounted-volume friendly).
ENV UV_COMPILE_BYTECODE=1
ENV UV_LINK_MODE=copy

# Install dependencies from the lockfile (no project, no dev deps).
RUN --mount=type=cache,target=/root/.cache/uv \
    --mount=type=bind,source=uv.lock,target=uv.lock \
    --mount=type=bind,source=pyproject.toml,target=pyproject.toml \
    uv sync --locked --no-install-project --no-dev

# App code: root agents (bot.py, action_worker.py, llm.py) + the prm/ package
# (protocol, api_client, services). The base image runs bot.py.
COPY ./*.py ./
COPY ./prm ./prm
