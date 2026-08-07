from fastapi import FastAPI

app = FastAPI(
    title="T2 Quiz Rooms API",
    version="0.1.0",
)


@app.get("/health", tags=["system"])
async def healthcheck() -> dict[str, str]:
    return {"status": "ok"}
