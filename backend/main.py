from fastapi import FastAPI, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware
import uvicorn
from contextlib import asynccontextmanager

from routers import iot_receiver, api_viewer, admin_api, external_api
from scheduler import start_schedulers
from ws_manager import manager

scheduler_instance = None

@asynccontextmanager
async def lifespan(app: FastAPI):
    global scheduler_instance
    print("Starting up EnvAiroMetrics V2.0 Backend...")
    scheduler_instance = start_schedulers()
    yield
    print("Shutting down...")
    if scheduler_instance:
        scheduler_instance.shutdown()

app = FastAPI(title="EnvAiroMetrics V2.0 API (Dynamic-O)", lifespan=lifespan)

# CORS
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Include routers
app.include_router(iot_receiver.router)
app.include_router(api_viewer.router)
app.include_router(admin_api.router)
app.include_router(external_api.router)

@app.websocket("/ws")
async def websocket_endpoint(websocket: WebSocket):
    await manager.connect(websocket)
    try:
        while True:
            # Connection open for dashboard updates
            data = await websocket.receive_text()
    except WebSocketDisconnect:
        manager.disconnect(websocket)

@app.get("/")
def read_root():
    return {"message": "Welcome to EnvAiroMetrics V2.0 API"}

@app.get("/health")
def health_check():
    return {"status": "healthy"}

if __name__ == "__main__":
    import uvicorn
    uvicorn.run("main:app", host="0.0.0.0", port=8381, reload=False)
