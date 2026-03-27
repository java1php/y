from fastapi import FastAPI, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from typing import Dict, List, Optional
from datetime import datetime
import json
import uuid

app = FastAPI(title="CodeHub API", version="0.2.0")

# 允许前端跨域
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173", "http://127.0.0.1:5173"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# ========== 数据存储（内存数据库） ==========
class Database:
    def __init__(self):
        self.projects: Dict[str, dict] = {}
        self.posts: List[dict] = []           # 动态/想法
        self.comments: Dict[str, List[dict]] = {}  # 评论
        self.chat_messages: Dict[str, List[dict]] = {}  # 聊天记录
        self.users: Dict[str, dict] = {}       # 用户
        self.documents: Dict[str, dict] = {}   # 协作文档
        self.game_rooms: Dict[str, dict] = {}  # 游戏房间

db = Database()

# ========== 模型定义 ==========
class CodeSaveRequest(BaseModel):
    code: str
    language: str = "javascript"
    message: str = "保存代码"

class PostCreate(BaseModel):
    content: str
    code_snippet: Optional[str] = None
    author: str = "匿名用户"
    tags: List[str] = []

class CommentCreate(BaseModel):
    content: str
    author: str = "匿名用户"

class ChatMessage(BaseModel):
    content: str
    author: str = "匿名用户"
    room_id: str = "general"

class DocumentCreate(BaseModel):
    title: str
    content: str = ""
    author: str = "匿名用户"

class GameMove(BaseModel):
    room_id: str
    player: str
    position: int  # 0-8  tic-tac-toe

# ========== WebSocket 连接管理 ==========
class ConnectionManager:
    def __init__(self):
        self.active_connections: Dict[str, List[WebSocket]] = {}
    
    async def connect(self, websocket: WebSocket, room_id: str):
        await websocket.accept()
        if room_id not in self.active_connections:
            self.active_connections[room_id] = []
        self.active_connections[room_id].append(websocket)
    
    def disconnect(self, websocket: WebSocket, room_id: str):
        if room_id in self.active_connections:
            if websocket in self.active_connections[room_id]:
                self.active_connections[room_id].remove(websocket)
    
    async def broadcast(self, message: dict, room_id: str, exclude: WebSocket = None):
        if room_id in self.active_connections:
            for connection in self.active_connections[room_id]:
                if connection != exclude:
                    await connection.send_json(message)
    
    async def send_personal(self, message: dict, websocket: WebSocket):
        await websocket.send_json(message)

manager = ConnectionManager()

# ========== 基础路由 ==========
@app.get("/")
async def root():
    return {
        "message": "CodeHub API 运行中",
        "version": "0.2.0",
        "features": ["code_editor", "chat", "social", "documents", "games"]
    }

# ========== 代码编辑器 ==========
@app.get("/api/projects/{project_id}")
async def get_project(project_id: str):
    if project_id not in db.projects:
        db.projects[project_id] = {
            "id": project_id,
            "code": "// 开始编写你的代码...\nconsole.log('Hello CodeHub!');",
            "language": "javascript",
            "versions": [],
            "created_at": datetime.now().isoformat()
        }
    return db.projects[project_id]

@app.post("/api/projects/{project_id}/save")
async def save_project(project_id: str, request: CodeSaveRequest):
    if project_id not in db.projects:
        db.projects[project_id] = {
            "id": project_id,
            "code": "",
            "language": request.language,
            "versions": [],
            "created_at": datetime.now().isoformat()
        }
    
    version = {
        "version_id": len(db.projects[project_id]["versions"]) + 1,
        "code": request.code,
        "message": request.message,
        "timestamp": datetime.now().isoformat()
    }
    
    db.projects[project_id]["code"] = request.code
    db.projects[project_id]["language"] = request.language
    db.projects[project_id]["versions"].append(version)
    
    return {"success": True, "message": "保存成功", "version": version["version_id"]}

@app.get("/api/projects/{project_id}/versions")
async def get_versions(project_id: str):
    if project_id not in db.projects:
        return {"versions": []}
    return {"versions": db.projects[project_id].get("versions", [])}

# ========== 社交动态 ==========
@app.get("/api/posts")
async def get_posts(page: int = 1, limit: int = 20):
    """获取动态流"""
    start = (page - 1) * limit
    end = start + limit
    posts = sorted(db.posts, key=lambda x: x["created_at"], reverse=True)[start:end]
    
    # 添加评论数
    for post in posts:
        post["comment_count"] = len(db.comments.get(post["id"], []))
    
    return {"posts": posts, "total": len(db.posts)}

@app.post("/api/posts")
async def create_post(post: PostCreate):
    """发布动态"""
    new_post = {
        "id": str(uuid.uuid4()),
        "content": post.content,
        "code_snippet": post.code_snippet,
        "author": post.author,
        "tags": post.tags,
        "likes": 0,
        "created_at": datetime.now().isoformat()
    }
    db.posts.append(new_post)
    
    # 广播给所有连接的客户端
    await manager.broadcast({
        "type": "new_post",
        "post": new_post
    }, "social_feed")
    
    return {"success": True, "post": new_post}

@app.post("/api/posts/{post_id}/like")
async def like_post(post_id: str):
    """点赞"""
    for post in db.posts:
        if post["id"] == post_id:
            post["likes"] += 1
            return {"success": True, "likes": post["likes"]}
    return {"success": False, "message": "动态不存在"}

# ========== 评论系统 ==========
@app.get("/api/posts/{post_id}/comments")
async def get_comments(post_id: str):
    """获取评论"""
    return {"comments": db.comments.get(post_id, [])}

@app.post("/api/posts/{post_id}/comments")
async def add_comment(post_id: str, comment: CommentCreate):
    """添加评论"""
    if post_id not in db.comments:
        db.comments[post_id] = []
    
    new_comment = {
        "id": str(uuid.uuid4()),
        "post_id": post_id,
        "content": comment.content,
        "author": comment.author,
        "created_at": datetime.now().isoformat()
    }
    db.comments[post_id].append(new_comment)
    
    return {"success": True, "comment": new_comment}

# ========== 聊天系统 ==========
@app.get("/api/chat/{room_id}/history")
async def get_chat_history(room_id: str, limit: int = 50):
    """获取聊天历史"""
    messages = db.chat_messages.get(room_id, [])[-limit:]
    return {"messages": messages}

# ========== 协作文档 ==========
@app.get("/api/documents")
async def get_documents():
    """获取所有文档"""
    docs = sorted(db.documents.values(), key=lambda x: x["updated_at"], reverse=True)
    return {"documents": docs}

@app.post("/api/documents")
async def create_document(doc: DocumentCreate):
    """创建文档"""
    doc_id = str(uuid.uuid4())
    new_doc = {
        "id": doc_id,
        "title": doc.title,
        "content": doc.content,
        "author": doc.author,
        "created_at": datetime.now().isoformat(),
        "updated_at": datetime.now().isoformat()
    }
    db.documents[doc_id] = new_doc
    return {"success": True, "document": new_doc}

@app.get("/api/documents/{doc_id}")
async def get_document(doc_id: str):
    """获取文档"""
    if doc_id in db.documents:
        return db.documents[doc_id]
    return {"error": "文档不存在"}

@app.put("/api/documents/{doc_id}")
async def update_document(doc_id: str, doc: DocumentCreate):
    """更新文档"""
    if doc_id in db.documents:
        db.documents[doc_id]["content"] = doc.content
        db.documents[doc_id]["updated_at"] = datetime.now().isoformat()
        return {"success": True, "document": db.documents[doc_id]}
    return {"error": "文档不存在"}

# ========== 游戏系统（井字棋） ==========
@app.get("/api/games/rooms")
async def get_game_rooms():
    """获取游戏房间列表"""
    rooms = []
    for room_id, room in db.game_rooms.items():
        rooms.append({
            "id": room_id,
            "name": room.get("name", "未命名房间"),
            "players": len(room.get("players", [])),
            "status": room.get("status", "waiting"),
            "game_type": room.get("game_type", "tictactoe")
        })
    return {"rooms": rooms}

@app.post("/api/games/rooms")
async def create_game_room(name: str, game_type: str = "tictactoe"):
    """创建游戏房间"""
    room_id = str(uuid.uuid4())[:8]
    db.game_rooms[room_id] = {
        "id": room_id,
        "name": name,
        "game_type": game_type,
        "players": [],
        "status": "waiting",
        "board": [""] * 9,  # 井字棋 3x3
        "current_player": "X",
        "winner": None,
        "created_at": datetime.now().isoformat()
    }
    return {"success": True, "room": db.game_rooms[room_id]}

@app.get("/api/games/rooms/{room_id}")
async def get_game_state(room_id: str):
    """获取游戏状态"""
    if room_id in db.game_rooms:
        return db.game_rooms[room_id]
    return {"error": "房间不存在"}

# ========== WebSocket 路由 ==========
@app.websocket("/ws/editor/{room_id}")
async def editor_websocket(websocket: WebSocket, room_id: str):
    """代码编辑器实时协作"""
    await manager.connect(websocket, f"editor_{room_id}")
    try:
        while True:
            data = await websocket.receive_json()
            data["type"] = "code_update"
            await manager.broadcast(data, f"editor_{room_id}", exclude=websocket)
    except WebSocketDisconnect:
        manager.disconnect(websocket, f"editor_{room_id}")

@app.websocket("/ws/chat/{room_id}")
async def chat_websocket(websocket: WebSocket, room_id: str):
    """聊天室"""
    await manager.connect(websocket, f"chat_{room_id}")
    
    # 发送欢迎消息
    await manager.send_personal({
        "type": "system",
        "content": f"欢迎来到 {room_id} 聊天室！"
    }, websocket)
    
    try:
        while True:
            data = await websocket.receive_json()
            
            message = {
                "id": str(uuid.uuid4()),
                "type": "chat",
                "author": data.get("author", "匿名"),
                "content": data.get("content"),
                "timestamp": datetime.now().isoformat()
            }
            
            # 保存到历史
            if room_id not in db.chat_messages:
                db.chat_messages[room_id] = []
            db.chat_messages[room_id].append(message)
            
            # 广播
            await manager.broadcast(message, f"chat_{room_id}")
    except WebSocketDisconnect:
        manager.disconnect(websocket, f"chat_{room_id}")

@app.websocket("/ws/social")
async def social_websocket(websocket: WebSocket):
    """社交动态实时更新"""
    await manager.connect(websocket, "social_feed")
    try:
        while True:
            data = await websocket.receive_json()
            # 处理社交相关消息
            if data.get("type") == "like":
                await manager.broadcast(data, "social_feed")
    except WebSocketDisconnect:
        manager.disconnect(websocket, "social_feed")

@app.websocket("/ws/document/{doc_id}")
async def document_websocket(websocket: WebSocket, doc_id: str):
    """文档实时协作"""
    await manager.connect(websocket, f"doc_{doc_id}")
    try:
        while True:
            data = await websocket.receive_json()
            data["type"] = "doc_update"
            await manager.broadcast(data, f"doc_{doc_id}", exclude=websocket)
    except WebSocketDisconnect:
        manager.disconnect(websocket, f"doc_{doc_id}")

@app.websocket("/ws/game/{room_id}")
async def game_websocket(websocket: WebSocket, room_id: str):
    """游戏实时同步"""
    await manager.connect(websocket, f"game_{room_id}")
    
    if room_id in db.game_rooms:
        room = db.game_rooms[room_id]
        if len(room["players"]) < 2:
            room["players"].append(websocket)
            player_symbol = "X" if len(room["players"]) == 1 else "O"
            
            await manager.send_personal({
                "type": "player_assigned",
                "symbol": player_symbol
            }, websocket)
            
            if len(room["players"]) == 2:
                room["status"] = "playing"
                await manager.broadcast({
                    "type": "game_start",
                    "board": room["board"],
                    "current_player": room["current_player"]
                }, f"game_{room_id}")
    
    try:
        while True:
            data = await websocket.receive_json()
            
            if data.get("type") == "move" and room_id in db.game_rooms:
                room = db.game_rooms[room_id]
                position = data.get("position")
                player = data.get("player")
                
                # 更新棋盘
                if room["board"][position] == "" and room["current_player"] == player:
                    room["board"][position] = player
                    room["current_player"] = "O" if player == "X" else "X"
                    
                    # 检查胜负
                    winner = check_winner(room["board"])
                    if winner:
                        room["winner"] = winner
                        room["status"] = "finished"
                    
                    # 广播游戏状态
                    await manager.broadcast({
                        "type": "game_update",
                        "board": room["board"],
                        "current_player": room["current_player"],
                        "winner": room["winner"]
                    }, f"game_{room_id}")
    except WebSocketDisconnect:
        manager.disconnect(websocket, f"game_{room_id}")
        if room_id in db.game_rooms:
            if websocket in db.game_rooms[room_id]["players"]:
                db.game_rooms[room_id]["players"].remove(websocket)

def check_winner(board):
    """检查井字棋胜负"""
    wins = [
        [0, 1, 2], [3, 4, 5], [6, 7, 8],  # 横
        [0, 3, 6], [1, 4, 7], [2, 5, 8],  # 竖
        [0, 4, 8], [2, 4, 6]              # 斜
    ]
    for a, b, c in wins:
        if board[a] and board[a] == board[b] == board[c]:
            return board[a]
    if "" not in board:
        return "draw"
    return None

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)
