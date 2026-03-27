# CodeHub - 在线协作社区

一个集 **代码编辑、实时聊天、社交动态、协作游戏、文档写作** 于一体的在线平台。

## ✨ 功能特性

### 1. 💻 代码编辑器
- VS Code 同款 Monaco Editor
- 支持 JavaScript、Python、HTML、CSS 等语言
- 实时协作编辑（多人同时编辑同一文件）
- 代码版本历史管理

### 2. 💬 聊天室
- 多房间聊天
- 实时消息同步
- 聊天记录持久化

### 3. 🌐 社交动态
- 发布想法/动态
- 分享代码片段
- 点赞互动
- 评论系统

### 4. 🎮 协作游戏
- 井字棋实时对战
- 多房间支持
- 实时游戏状态同步

### 5. 📄 协作文档
- 创建和编辑文档
- 文档列表管理
- 支持多人协作（后续扩展）

## 🛠️ 技术栈

- **后端**: Python + FastAPI + WebSocket
- **前端**: React + Monaco Editor
- **实时通信**: WebSocket

## 🚀 快速启动

### 一键启动
```bash
cd codehub
./start.sh
```

### 手动启动

**1. 启动后端**
```bash
cd backend
source venv/bin/activate
cd app
python main.py
```
后端: http://localhost:8000

**2. 启动前端**
```bash
cd frontend
npm run dev
```
前端: http://localhost:5173

## 📖 使用指南

### 写代码
1. 打开「写代码」标签
2. 在编辑器中编写代码
3. 点击「分享协作」邀请朋友
4. 朋友打开链接后可实时同步编辑

### 聊天
1. 进入「聊天」标签
2. 输入房间号加入或创建房间
3. 实时发送消息

### 发动态
1. 进入「动态」标签
2. 在文本框输入想法
3. 可附加代码片段
4. 点击发布

### 玩游戏
1. 进入「游戏」标签
2. 创建房间或输入房间号加入
3. 邀请朋友加入同一房间
4. 开始井字棋对战

### 写文档
1. 进入「文档」标签
2. 输入标题创建新文档
3. 在编辑器中写作
4. 点击保存

## 🔌 API 接口

### 代码编辑
- `GET /api/projects/{id}` - 获取项目
- `POST /api/projects/{id}/save` - 保存代码
- `GET /api/projects/{id}/versions` - 获取版本历史

### 社交
- `GET /api/posts` - 获取动态流
- `POST /api/posts` - 发布动态
- `POST /api/posts/{id}/like` - 点赞
- `GET /api/posts/{id}/comments` - 获取评论

### 聊天
- `GET /api/chat/{room_id}/history` - 获取聊天记录
- `WS /ws/chat/{room_id}` - WebSocket 实时聊天

### 游戏
- `GET /api/games/rooms` - 获取游戏房间
- `POST /api/games/rooms` - 创建房间
- `WS /ws/game/{room_id}` - WebSocket 游戏同步

### 文档
- `GET /api/documents` - 获取文档列表
- `POST /api/documents` - 创建文档
- `PUT /api/documents/{id}` - 更新文档

## 📁 项目结构

```
codehub/
├── backend/
│   ├── app/
│   │   └── main.py      # FastAPI 后端（所有 API + WebSocket）
│   └── requirements.txt
├── frontend/
│   ├── src/
│   │   └── App.jsx      # React 前端（所有功能模块）
│   └── package.json
└── start.sh             # 一键启动脚本
```

## 🎯 后续可添加

- [ ] 用户注册/登录系统
- [ ] 更多游戏（五子棋、猜词等）
- [ ] 文档实时协作编辑
- [ ] AI 代码辅助
- [ ] 代码执行沙箱
- [ ] 文件上传/图片分享
- [ ] 移动端适配

## 📌 停止服务

```bash
pkill -f "python main.py"
pkill -f "npm run dev"
```
