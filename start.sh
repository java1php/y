#!/bin/bash

# CodeHub 启动脚本

echo "🚀 启动 CodeHub..."

# 检查 Python 后端
if ! command -v python3 &> /dev/null; then
    echo "❌ 需要安装 Python3"
    exit 1
fi

# 检查 Node.js
if ! command -v node &> /dev/null; then
    echo "❌ 需要安装 Node.js"
    exit 1
fi

# 启动后端
echo "📦 启动后端服务..."
cd backend
if [ ! -d "venv" ]; then
    echo "创建虚拟环境..."
    python3 -m venv venv
fi
source venv/bin/activate
pip install -q -r requirements.txt
python -c "import app.main" 2>/dev/null || echo "安装依赖..."

cd app
python main.py &
BACKEND_PID=$!
echo "后端 PID: $BACKEND_PID"
cd ../..

# 等待后端启动
sleep 2

# 启动前端
echo "⚛️ 启动前端..."
cd frontend
if [ ! -d "node_modules" ]; then
    echo "安装前端依赖..."
    npm install
fi
npm run dev &
FRONTEND_PID=$!
echo "前端 PID: $FRONTEND_PID"
cd ..

echo ""
echo "✅ CodeHub 已启动！"
echo ""
echo "📝 访问地址:"
echo "   前端: http://localhost:5173"
echo "   后端 API: http://localhost:8000"
echo "   API 文档: http://localhost:8000/docs"
echo ""
echo "按 Ctrl+C 停止服务"

# 等待用户中断
trap "kill $BACKEND_PID $FRONTEND_PID; exit" INT
wait
