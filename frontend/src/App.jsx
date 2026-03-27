import { useState, useEffect, useCallback, useRef } from 'react'
import Editor from '@monaco-editor/react'

// 生成唯一 ID
const generateId = () => Math.random().toString(36).substring(2, 15)

// 获取用户名
const getUsername = () => {
  const saved = localStorage.getItem('username')
  if (saved) return saved
  const name = '用户' + Math.floor(Math.random() * 10000)
  localStorage.setItem('username', name)
  return name
}

function App() {
  const [currentUser] = useState(getUsername())
  const [activeTab, setActiveTab] = useState('editor') // editor, chat, social, game, docs
  
  // 代码编辑器状态
  const [code, setCode] = useState('// 开始编写你的代码...\nconsole.log("Hello CodeHub!");')
  const [language, setLanguage] = useState('javascript')
  const [roomId, setRoomId] = useState(() => generateId())
  const [versions, setVersions] = useState([])
  const [saveMessage, setSaveMessage] = useState('')
  
  // WebSocket
  const [editorWs, setEditorWs] = useState(null)
  const [connected, setConnected] = useState(false)
  
  // 聊天状态
  const [chatMessages, setChatMessages] = useState([])
  const [chatInput, setChatInput] = useState('')
  const [chatRoom, setChatRoom] = useState('general')
  const chatWsRef = useRef(null)
  const chatEndRef = useRef(null)
  
  // 社交动态状态
  const [posts, setPosts] = useState([])
  const [newPostContent, setNewPostContent] = useState('')
  const [newPostCode, setNewPostCode] = useState('')
  
  // 游戏状态
  const [gameBoard, setGameBoard] = useState(Array(9).fill(''))
  const [gameRoom, setGameRoom] = useState('')
  const [playerSymbol, setPlayerSymbol] = useState('')
  const [currentPlayer, setCurrentPlayer] = useState('X')
  const [winner, setWinner] = useState(null)
  const [gameStatus, setGameStatus] = useState('waiting')
  const gameWsRef = useRef(null)
  
  // 文档状态
  const [documents, setDocuments] = useState([])
  const [currentDoc, setCurrentDoc] = useState(null)
  const [docTitle, setDocTitle] = useState('')
  const [docContent, setDocContent] = useState('')

  // ========== 代码编辑器 WebSocket ==========
  useEffect(() => {
    const ws = new WebSocket(`ws://localhost:8000/ws/editor/${roomId}`)
    
    ws.onopen = () => {
      console.log('编辑器 WebSocket 已连接')
      setConnected(true)
    }
    
    ws.onmessage = (event) => {
      const data = JSON.parse(event.data)
      if (data.type === 'code_update' && data.code !== undefined) {
        setCode(data.code)
      }
    }
    
    ws.onclose = () => setConnected(false)
    setEditorWs(ws)
    
    return () => ws.close()
  }, [roomId])

  // ========== 聊天 WebSocket ==========
  useEffect(() => {
    const ws = new WebSocket(`ws://localhost:8000/ws/chat/${chatRoom}`)
    chatWsRef.current = ws
    
    ws.onmessage = (event) => {
      const data = JSON.parse(event.data)
      if (data.type === 'chat' || data.type === 'system') {
        setChatMessages(prev => [...prev, data])
      }
    }
    
    // 加载历史消息
    fetch(`/api/chat/${chatRoom}/history`)
      .then(res => res.json())
      .then(data => setChatMessages(data.messages || []))
    
    return () => ws.close()
  }, [chatRoom])

  // 聊天自动滚动
  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [chatMessages])

  // ========== 社交动态加载 ==========
  useEffect(() => {
    fetch('/api/posts')
      .then(res => res.json())
      .then(data => setPosts(data.posts || []))
  }, [])

  // ========== 游戏 ==========
  const joinGame = (roomIdToJoin) => {
    if (gameWsRef.current) gameWsRef.current.close()
    
    const ws = new WebSocket(`ws://localhost:8000/ws/game/${roomIdToJoin}`)
    gameWsRef.current = ws
    setGameRoom(roomIdToJoin)
    
    ws.onmessage = (event) => {
      const data = JSON.parse(event.data)
      
      if (data.type === 'player_assigned') {
        setPlayerSymbol(data.symbol)
      }
      if (data.type === 'game_start') {
        setGameStatus('playing')
        setGameBoard(data.board)
        setCurrentPlayer(data.current_player)
      }
      if (data.type === 'game_update') {
        setGameBoard(data.board)
        setCurrentPlayer(data.current_player)
        setWinner(data.winner)
        if (data.winner) setGameStatus('finished')
      }
    }
  }

  const makeMove = (position) => {
    if (gameBoard[position] || winner || currentPlayer !== playerSymbol) return
    
    gameWsRef.current?.send(JSON.stringify({
      type: 'move',
      position,
      player: playerSymbol
    }))
  }

  // ========== 文档 ==========
  useEffect(() => {
    fetch('/api/documents')
      .then(res => res.json())
      .then(data => setDocuments(data.documents || []))
  }, [])

  const createDocument = () => {
    if (!docTitle.trim()) return
    
    fetch('/api/documents', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        title: docTitle,
        content: '',
        author: currentUser
      })
    })
    .then(res => res.json())
    .then(data => {
      if (data.success) {
        setDocuments([data.document, ...documents])
        setDocTitle('')
        setCurrentDoc(data.document)
        setActiveTab('docs')
      }
    })
  }

  // ========== 代码编辑器功能 ==========
  const handleCodeChange = useCallback((value) => {
    setCode(value)
    if (editorWs?.readyState === WebSocket.OPEN) {
      editorWs.send(JSON.stringify({ code: value, language }))
    }
  }, [editorWs, language])

  const saveCode = async () => {
    try {
      const response = await fetch(`/api/projects/${roomId}/save`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ code, language, message: saveMessage || '更新代码' })
      })
      const data = await response.json()
      if (data.success) {
        alert(`保存成功！版本: v${data.version}`)
        setSaveMessage('')
        fetch(`/api/projects/${roomId}/versions`)
          .then(res => res.json())
          .then(data => setVersions(data.versions || []))
      }
    } catch (error) {
      alert('保存失败: ' + error.message)
    }
  }

  // ========== 聊天功能 ==========
  const sendChatMessage = () => {
    if (!chatInput.trim()) return
    
    chatWsRef.current?.send(JSON.stringify({
      author: currentUser,
      content: chatInput
    }))
    setChatInput('')
  }

  // ========== 发布动态 ==========
  const createPost = () => {
    if (!newPostContent.trim()) return
    
    fetch('/api/posts', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        content: newPostContent,
        code_snippet: newPostCode || null,
        author: currentUser,
        tags: []
      })
    })
    .then(res => res.json())
    .then(data => {
      if (data.success) {
        setPosts([data.post, ...posts])
        setNewPostContent('')
        setNewPostCode('')
      }
    })
  }

  const likePost = (postId) => {
    fetch(`/api/posts/${postId}/like`, { method: 'POST' })
      .then(() => {
        setPosts(posts.map(p => p.id === postId ? {...p, likes: p.likes + 1} : p))
      })
  }

  // ========== 渲染 ==========
  return (
    <div style={{ height: '100vh', display: 'flex', flexDirection: 'column', background: '#1a1a2e', color: '#fff' }}>
      {/* 顶部导航 */}
      <header style={{ background: '#16213e', padding: '12px 20px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', borderBottom: '1px solid #0f3460' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '20px' }}>
          <h1 style={{ fontSize: '24px', color: '#e94560' }}>🚀 CodeHub</h1>
          <span style={{ fontSize: '14px', color: '#888' }}>欢迎, {currentUser}</span>
        </div>
        
        <nav style={{ display: 'flex', gap: '10px' }}>
          {[
            { id: 'editor', icon: '💻', label: '写代码' },
            { id: 'chat', icon: '💬', label: '聊天' },
            { id: 'social', icon: '🌐', label: '动态' },
            { id: 'game', icon: '🎮', label: '游戏' },
            { id: 'docs', icon: '📄', label: '文档' }
          ].map(tab => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              style={{
                padding: '10px 20px',
                borderRadius: '8px',
                border: 'none',
                background: activeTab === tab.id ? '#e94560' : '#1a1a2e',
                color: '#fff',
                cursor: 'pointer',
                fontSize: '14px',
                display: 'flex',
                alignItems: 'center',
                gap: '6px'
              }}
            >
              {tab.icon} {tab.label}
            </button>
          ))}
        </nav>
      </header>

      {/* 内容区域 */}
      <main style={{ flex: 1, overflow: 'hidden' }}>
        
        {/* ===== 代码编辑器 ===== */}
        {activeTab === 'editor' && (
          <div style={{ height: '100%', display: 'flex' }}>
            <div style={{ flex: 1 }}>
              <div style={{ padding: '10px', background: '#0f3460', display: 'flex', gap: '10px' }}>
                <select value={language} onChange={(e) => setLanguage(e.target.value)} style={{ padding: '8px', borderRadius: '4px' }}>
                  <option value="javascript">JavaScript</option>
                  <option value="typescript">TypeScript</option>
                  <option value="python">Python</option>
                  <option value="html">HTML</option>
                  <option value="css">CSS</option>
                </select>
                <input type="text" placeholder="保存说明" value={saveMessage} onChange={(e) => setSaveMessage(e.target.value)} style={{ padding: '8px', flex: 1 }} />
                <button onClick={saveCode} style={{ padding: '8px 16px', background: '#e94560', border: 'none', borderRadius: '4px', color: '#fff', cursor: 'pointer' }}>💾 保存</button>
                <button onClick={() => navigator.clipboard.writeText(`${window.location.origin}?room=${roomId}`).then(() => alert('链接已复制！'))} style={{ padding: '8px 16px', background: '#1a1a2e', border: '1px solid #0f3460', borderRadius: '4px', color: '#fff', cursor: 'pointer' }}>🔗 分享协作</button>
              </div>
              <Editor height="calc(100% - 50px)" language={language} value={code} onChange={handleCodeChange} theme="vs-dark" options={{ fontSize: 14, minimap: { enabled: true }, automaticLayout: true }} />
            </div>
            <div style={{ width: '250px', background: '#16213e', padding: '15px', overflowY: 'auto' }}>
              <h3>📜 版本历史</h3>
              <button onClick={() => fetch(`/api/projects/${roomId}/versions`).then(r => r.json()).then(d => setVersions(d.versions || []))} style={{ margin: '10px 0', padding: '6px 12px', fontSize: '12px' }}>刷新</button>
              {versions.map((v, i) => (
                <div key={i} style={{ padding: '10px', background: '#1a1a2e', margin: '8px 0', borderRadius: '6px', fontSize: '12px' }}>
                  <div style={{ color: '#e94560', fontWeight: 'bold' }}>v{v.version_id}</div>
                  <div style={{ color: '#888' }}>{v.message}</div>
                  <button onClick={() => setCode(v.code)} style={{ marginTop: '6px', padding: '4px 8px', fontSize: '11px' }}>恢复</button>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* ===== 聊天室 ===== */}
        {activeTab === 'chat' && (
          <div style={{ height: '100%', display: 'flex', flexDirection: 'column', maxWidth: '800px', margin: '0 auto', padding: '20px' }}>
            <div style={{ display: 'flex', gap: '10px', marginBottom: '15px' }}>
              <input type="text" value={chatRoom} onChange={(e) => setChatRoom(e.target.value)} placeholder="房间名称" style={{ padding: '10px', flex: 1, borderRadius: '6px', border: '1px solid #0f3460', background: '#16213e', color: '#fff' }} />
              <button onClick={() => { setChatRoom(chatRoom); setChatMessages([]) }} style={{ padding: '10px 20px', background: '#e94560', border: 'none', borderRadius: '6px', color: '#fff', cursor: 'pointer' }}>切换房间</button>
            </div>
            
            <div style={{ flex: 1, background: '#16213e', borderRadius: '12px', padding: '15px', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '10px' }}>
              {chatMessages.map((msg, i) => (
                <div key={i} style={{ 
                  alignSelf: msg.author === currentUser ? 'flex-end' : 'flex-start',
                  background: msg.type === 'system' ? '#0f3460' : (msg.author === currentUser ? '#e94560' : '#1a1a2e'),
                  padding: '10px 15px', borderRadius: '12px', maxWidth: '70%', fontSize: '14px'
                }}>
                  {msg.type !== 'system' && <div style={{ fontSize: '11px', opacity: 0.7, marginBottom: '4px' }}>{msg.author}</div>}
                  <div>{msg.content}</div>
                  {msg.timestamp && <div style={{ fontSize: '10px', opacity: 0.5, marginTop: '4px' }}>{new Date(msg.timestamp).toLocaleTimeString()}</div>}
                </div>
              ))}
              <div ref={chatEndRef} />
            </div>
            
            <div style={{ display: 'flex', gap: '10px', marginTop: '15px' }}>
              <input type="text" value={chatInput} onChange={(e) => setChatInput(e.target.value)} onKeyPress={(e) => e.key === 'Enter' && sendChatMessage()} placeholder="输入消息..." style={{ flex: 1, padding: '12px', borderRadius: '8px', border: '1px solid #0f3460', background: '#16213e', color: '#fff' }} />
              <button onClick={sendChatMessage} style={{ padding: '12px 24px', background: '#e94560', border: 'none', borderRadius: '8px', color: '#fff', cursor: 'pointer', fontSize: '16px' }}>发送</button>
            </div>
          </div>
        )}

        {/* ===== 社交动态 ===== */}
        {activeTab === 'social' && (
          <div style={{ height: '100%', overflowY: 'auto', maxWidth: '700px', margin: '0 auto', padding: '20px' }}>
            {/* 发布框 */}
            <div style={{ background: '#16213e', padding: '20px', borderRadius: '12px', marginBottom: '20px' }}>
              <textarea value={newPostContent} onChange={(e) => setNewPostContent(e.target.value)} placeholder="分享你的想法..." style={{ width: '100%', minHeight: '80px', padding: '12px', borderRadius: '8px', border: '1px solid #0f3460', background: '#1a1a2e', color: '#fff', resize: 'vertical' }} />
              <textarea value={newPostCode} onChange={(e) => setNewPostCode(e.target.value)} placeholder="分享代码片段（可选）..." style={{ width: '100%', height: '60px', marginTop: '10px', padding: '12px', borderRadius: '8px', border: '1px solid #0f3460', background: '#1a1a2e', color: '#fff', fontFamily: 'monospace', fontSize: '12px' }} />
              <button onClick={createPost} style={{ marginTop: '15px', padding: '10px 24px', background: '#e94560', border: 'none', borderRadius: '8px', color: '#fff', cursor: 'pointer' }}>🚀 发布</button>
            </div>
            
            {/* 动态列表 */}
            {posts.map(post => (
              <div key={post.id} style={{ background: '#16213e', padding: '20px', borderRadius: '12px', marginBottom: '15px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '10px' }}>
                  <span style={{ color: '#e94560', fontWeight: 'bold' }}>{post.author}</span>
                  <span style={{ color: '#666', fontSize: '12px' }}>{new Date(post.created_at).toLocaleString()}</span>
                </div>
                <div style={{ lineHeight: 1.6, marginBottom: '10px' }}>{post.content}</div>
                {post.code_snippet && (
                  <pre style={{ background: '#1a1a2e', padding: '12px', borderRadius: '8px', overflow: 'auto', fontSize: '13px', border: '1px solid #0f3460' }}><code>{post.code_snippet}</code></pre>
                )}
                <div style={{ display: 'flex', gap: '20px', marginTop: '15px' }}>
                  <button onClick={() => likePost(post.id)} style={{ background: 'transparent', border: 'none', color: '#e94560', cursor: 'pointer', fontSize: '14px' }}>❤️ {post.likes}</button>
                  <span style={{ color: '#666', fontSize: '14px' }}>💬 {post.comment_count || 0}</span>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* ===== 游戏 ===== */}
        {activeTab === 'game' && (
          <div style={{ height: '100%', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '20px' }}>
            {!gameRoom ? (
              <div style={{ textAlign: 'center' }}>
                <h2 style={{ marginBottom: '30px' }}>🎮 井字棋游戏</h2>
                <div style={{ display: 'flex', gap: '15px', marginBottom: '30px' }}>
                  <input type="text" value={gameRoom} onChange={(e) => setGameRoom(e.target.value)} placeholder="输入房间号加入" style={{ padding: '12px', borderRadius: '8px', border: '1px solid #0f3460', background: '#16213e', color: '#fff', width: '200px' }} />
                  <button onClick={() => gameRoom && joinGame(gameRoom)} style={{ padding: '12px 24px', background: '#e94560', border: 'none', borderRadius: '8px', color: '#fff', cursor: 'pointer' }}>加入游戏</button>
                </div>
                <button onClick={() => {
                  const newRoom = generateId().slice(0, 8)
                  fetch('/api/games/rooms', { method: 'POST', headers: {'Content-Type': 'application/json'}, body: JSON.stringify({ name: `房间${newRoom}` }) })
                    .then(r => r.json()).then(data => { if (data.success) joinGame(data.room.id) })
                }} style={{ padding: '15px 30px', background: '#1a1a2e', border: '2px solid #e94560', borderRadius: '8px', color: '#fff', cursor: 'pointer', fontSize: '16px' }}>➕ 创建新房间</button>
              </div>
            ) : (
              <div style={{ textAlign: 'center' }}>
                <h3 style={{ marginBottom: '20px' }}>房间: {gameRoom}</h3>
                <div style={{ marginBottom: '15px', color: '#888' }}>
                  你是: <span style={{ color: '#e94560', fontWeight: 'bold' }}>{playerSymbol || '等待中...'}</span> | 
                  当前回合: <span style={{ color: '#4caf50' }}>{currentPlayer}</span>
                </div>
                {winner && (
                  <div style={{ marginBottom: '20px', fontSize: '24px', color: winner === 'draw' ? '#888' : '#e94560' }}>
                    {winner === 'draw' ? '🤝 平局！' : `🎉 ${winner} 获胜！`}
                  </div>
                )}
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 100px)', gap: '10px', margin: '20px auto' }}>
                  {gameBoard.map((cell, i) => (
                    <button
                      key={i}
                      onClick={() => makeMove(i)}
                      disabled={!!cell || winner}
                      style={{
                        width: '100px', height: '100px', fontSize: '36px', fontWeight: 'bold',
                        background: cell ? '#16213e' : '#1a1a2e', border: '2px solid #0f3460',
                        borderRadius: '12px', cursor: cell || winner ? 'default' : 'pointer',
                        color: cell === 'X' ? '#e94560' : '#4caf50'
                      }}
                    >
                      {cell}
                    </button>
                  ))}
                </div>
                <button onClick={() => { setGameRoom(''); setGameBoard(Array(9).fill('')); setWinner(null); setGameStatus('waiting'); gameWsRef.current?.close(); }} style={{ padding: '10px 20px', background: '#1a1a2e', border: '1px solid #0f3460', borderRadius: '8px', color: '#fff', cursor: 'pointer' }}>退出房间</button>
              </div>
            )}
          </div>
        )}

        {/* ===== 文档 ===== */}
        {activeTab === 'docs' && (
          <div style={{ height: '100%', display: 'flex' }}>
            {/* 文档列表 */}
            <div style={{ width: '280px', background: '#16213e', padding: '20px', overflowY: 'auto' }}>
              <h3 style={{ marginBottom: '15px' }}>📄 我的文档</h3>
              <div style={{ display: 'flex', gap: '8px', marginBottom: '20px' }}>
                <input type="text" value={docTitle} onChange={(e) => setDocTitle(e.target.value)} placeholder="新文档标题" style={{ flex: 1, padding: '8px', borderRadius: '6px', border: '1px solid #0f3460', background: '#1a1a2e', color: '#fff' }} />
                <button onClick={createDocument} style={{ padding: '8px 12px', background: '#e94560', border: 'none', borderRadius: '6px', color: '#fff', cursor: 'pointer' }}>+</button>
              </div>
              {documents.map(doc => (
                <div key={doc.id} onClick={() => { setCurrentDoc(doc); setDocContent(doc.content); }} style={{ padding: '12px', margin: '8px 0', background: currentDoc?.id === doc.id ? '#e94560' : '#1a1a2e', borderRadius: '8px', cursor: 'pointer' }}>
                  <div style={{ fontWeight: 'bold' }}>{doc.title}</div>
                  <div style={{ fontSize: '11px', color: '#888', marginTop: '4px' }}>{new Date(doc.updated_at).toLocaleDateString()}</div>
                </div>
              ))}
            </div>
            
            {/* 编辑器 */}
            <div style={{ flex: 1, padding: '20px' }}>
              {currentDoc ? (
                <div style={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
                  <input type="text" value={currentDoc.title} readOnly style={{ padding: '12px', fontSize: '18px', fontWeight: 'bold', background: '#16213e', border: '1px solid #0f3460', borderRadius: '8px', color: '#fff', marginBottom: '15px' }} />
                  <textarea value={docContent} onChange={(e) => setDocContent(e.target.value)} placeholder="开始写作..." style={{ flex: 1, padding: '15px', background: '#16213e', border: '1px solid #0f3460', borderRadius: '8px', color: '#fff', resize: 'none', lineHeight: 1.8, fontSize: '15px' }} />
                  <button onClick={() => {
                    fetch(`/api/documents/${currentDoc.id}`, {
                      method: 'PUT',
                      headers: { 'Content-Type': 'application/json' },
                      body: JSON.stringify({ content: docContent, author: currentUser })
                    }).then(() => alert('保存成功！'))
                  }} style={{ marginTop: '15px', padding: '12px', background: '#e94560', border: 'none', borderRadius: '8px', color: '#fff', cursor: 'pointer' }}>💾 保存文档</button>
                </div>
              ) : (
                <div style={{ height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#666' }}>
                  选择一个文档或创建新文档
                </div>
              )}
            </div>
          </div>
        )}
      </main>
    </div>
  )
}

export default App
