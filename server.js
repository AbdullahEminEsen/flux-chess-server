// server.js — Flux Chess (server-authoritative)
const express = require('express');
const http = require('http');
const cors = require('cors');
const { Server } = require('socket.io');
const { nanoid } = require('nanoid');

// ====== Game Engine (sunucu tarafı) ======
const SIZE = 8;
const STATS = { K:{hp:8, atk:2}, T:{hp:6, atk:4}, V:{hp:5, atk:3}, O:{hp:5, atk:3}, R:{hp:5, atk:3}, S:{hp:3, atk:2} };
const RIDER_STEPS = [[2,1],[1,2],[2,-1],[1,-2],[-2,1],[-1,2],[-2,-1],[-1,-2],[3,1],[1,3],[3,-1],[1,-3],[-3,1],[-1,3],[-3,-1],[-1,-3]];
const speed = 0.005; // saldırı barı osilatör hızı (rad/ms)

const inBounds=(x,y)=> x>=0 && x<SIZE && y>=0 && y<SIZE;
const opp=c=> c==='W'?'B':'W';
const at=(state,x,y)=> state.board[y][x];
const piece = (t,c)=>{ const s=STATS[t]; return { type:t, color:c, id:(t+c+Math.random().toString(36).slice(2,7)), hp:s.hp, maxHp:s.hp, atk:s.atk } };

function initState(){
  const board=Array.from({length:SIZE},()=>Array(SIZE).fill(null));
  const back=['T','R','O','V','K','O','R','T'];
  for(let i=0;i<SIZE;i++) board[7][i]=piece(back[i],'W');
  for(let i=0;i<SIZE;i++) board[0][i]=piece(back[i],'B');
  for(let i=0;i<SIZE;i++){ board[6][i]=piece('S','W'); board[1][i]=piece('S','B'); }
  return { board, turn:'W', winner:null, bonusPending:null, oracleComboReady:{W:false,B:false}, oracleStreak:{W:0,B:0}, pendingAttack:null };
}

function legalMovesFor(state,x,y){
  const p=at(state,x,y); if(!p) return [];
  // Rider bonus adımı sunucuya taşımayı basit tutuyoruz -> şimdilik bonusPending istemci UX’i; legal setini etkilemiyor
  const moves=[]; const add=(nx,ny,k)=>{ if(inBounds(nx,ny)){ const q=at(state,nx,ny); if(!q || q.color!==p.color) moves.push({x:nx,y:ny,kind:q?'capture':'move'}); } };

  if(p.type==='K') for(let dx=-1;dx<=1;dx++) for(let dy=-1;dy<=1;dy++) if(dx||dy){ add(x+dx,y+dy); }
  if(p.type==='V'){
    const dirs=[[1,0],[-1,0],[0,1],[0,-1],[1,1],[-1,1],[1,-1],[-1,-1]];
    for(const [dx,dy] of dirs){ for(let s=1;s<=2;s++){ const nx=x+dx*s, ny=y+dy*s; if(!inBounds(nx,ny)) break; const q=at(state,nx,ny); if(!q) moves.push({x:nx,y:ny,kind:'move'}); else { if(q.color!==p.color) moves.push({x:nx,y:ny,kind:'capture'}); break; } } }
  }
  if(p.type==='O'){
    const limit=p.diagUnlimited?8:2; const dirs=[[1,1],[-1,1],[1,-1],[-1,-1]];
    for(const [dx,dy] of dirs){ for(let s=1;s<=limit;s++){ const nx=x+dx*s, ny=y+dy*s; if(!inBounds(nx,ny)) break; const q=at(state,nx,ny); if(!q) moves.push({x:nx,y:ny,kind:'move'}); else { if(q.color!==p.color) moves.push({x:nx,y:ny,kind:'capture'}); break; } } }
  }
  if(p.type==='R') for(const [dx,dy] of RIDER_STEPS){ const nx=x+dx, ny=y+dy; if(inBounds(nx,ny)){ const q=at(state,nx,ny); if(!q||q.color!==p.color) moves.push({x:nx,y:ny,kind:q?'capture':'move'}); } }
  if(p.type==='S'){
    const dir=p.color==='W'?-1:1; for(const dx of [-1,1]){ const nx=x+dx, ny=y+dir; if(inBounds(nx,ny)&&!at(state,nx,ny)) moves.push({x:nx,y:ny,kind:'move'}); }
    const fx=x, fy=y+dir; if(inBounds(fx,fy)){ const q=at(state,fx,fy); if(q&&q.color!==p.color) moves.push({x:fx,y:fy,kind:'capture'}); }
  }
  if(p.type==='T'){
    const dirs=[[1,0],[-1,0],[0,1],[0,-1]];
    // non-capture (<=3, upgrade varsa sınırsız)
    for(const [dx,dy] of dirs){ const limit=p.orthoUnlimited?8:3; for(let s=1;s<=limit;s++){ const nx=x+dx*s, ny=y+dy*s; if(!inBounds(nx,ny)) break; if(!at(state,nx,ny)) moves.push({x:nx,y:ny,kind:'move'}); else break; } }
    // cannon capture: tam 1 ekran
    for(const [dx,dy] of dirs){ let cx=x+dx, cy=y+dy; while(inBounds(cx,cy) && !at(state,cx,cy)){ cx+=dx; cy+=dy; } // ilk ekran
      if(!inBounds(cx,cy)) continue; cx+=dx; cy+=dy; while(inBounds(cx,cy) && !at(state,cx,cy)){ cx+=dx; cy+=dy; } // ekrandan sonra ilk taş
      if(!inBounds(cx,cy)) continue; const q=at(state,cx,cy); if(q && q.color!==p.color) moves.push({x:cx,y:cy,kind:'capture'}); }
  }
  return moves;
}

function applyMove(state, from, to){
  const p=at(state,from.x,from.y); const target=at(state,to.x,to.y);
  if(!p) return { state };
  if(target){
    // saldırı gerektiriyor — taşları yerinde bırak, pendingAttack oluştur
    state.pendingAttack = { sx:from.x, sy:from.y, tx:to.x, ty:to.y, attackerId:p.id, defenderId:target.id, startAt: Date.now() };
    return { state, pendingAttack: true };
  }
  // normal hamle
  state.board[from.y][from.x]=null; state.board[to.y][to.x]=p;
  // Scout terfi
  if(p.type==='S'){ if((p.color==='W' && to.y===0) || (p.color==='B' && to.y===SIZE-1)) p.type='R'; }
  // Oracle üçleme ve Rider bonus bayrağı (zorunluluk yok)
  if(p.type==='O'){
    state.oracleStreak[p.color]=(state.oracleStreak[p.color]||0)+1; state.oracleComboReady[p.color]=true; if(state.oracleStreak[p.color]>=3){ p.diagUnlimited=true; state.oracleStreak[p.color]=0; }
  } else {
    state.oracleStreak[p.color]=0; if(p.type==='R' && state.oracleComboReady[p.color]){ state.oracleComboReady[p.color]=false; /* bonusPending sunucu akışına eklenebilir */ }
  }
  // Tower kare döngüsü (opsiyonel: burada izlemek için basit iz bırakma)
  if(p.type==='T'){ // minimal izleyici
    const tr=p.towerTrace||(p.towerTrace={positions:[]}); tr.positions.push(from, to);
    const d=tr.positions; while(d.length>5) d.shift();
    if(d.length===5){ const [p0,p1,p2,p3,p4]=d; if(p4.x===p0.x&&p4.y===p0.y){ const v=(a,b)=>({x:b.x-a.x,y:b.y-a.y}); const v1=v(p0,p1),v2=v(p1,p2),v3=v(p2,p3),v4=v(p3,p4); const orth=(u,v)=> (u.x===0&&v.y===0)||(u.y===0&&v.x===0); const len=u=>Math.abs(u.x)+Math.abs(u.y); if(orth(v1,v2)&&orth(v2,v3)&&orth(v3,v4)&&orth(v4,v1)&&len(v1)>0&&len(v1)===len(v2)&&v3.x===-v1.x&&v3.y===-v1.y&&v4.x===-v2.x&&v4.y===-v2.y){ p.orthoUnlimited=true; tr.positions=[]; } } }
  }
  // Tur biter
  state.turn = opp(state.turn);
  return { state };
}

function resolveAttack(state){
  const pa = state.pendingAttack; if(!pa) return { state };
  const now = Date.now();
  const dt = now - pa.startAt; // sunucu zamanı
  const gauge = Math.sin(dt * speed); // -1..1; 0 merkez
  const attacker = at(state,pa.sx,pa.sy); const defender = at(state,pa.tx,pa.ty);
  state.pendingAttack = null;
  if(!attacker || !defender) { state.turn = opp(state.turn); return { state }; }
  const dist = Math.abs(gauge);
  const mult = Math.max(0.5, Math.min(1.5, 1.5 - dist));
  const dmg = Math.max(1, Math.round(attacker.atk * mult));
  defender.hp -= dmg;

  if(defender.hp <= 0){
    // Crown ölürse oyun biter
    const loseCrown = defender.type==='K';
    state.board[pa.tx][pa.ty] = undefined; // not used; keep style
    state.board[pa.ty][pa.tx] = null; state.board[pa.sy][pa.sx] = null; state.board[pa.ty][pa.tx] = attacker;
    // Scout terfi
    if(attacker.type==='S'){ if((attacker.color==='W' && pa.ty===0) || (attacker.color==='B' && pa.ty===SIZE-1)) attacker.type='R'; }
    // Oracle/Rider bayrakları
    if(attacker.type==='O'){
      state.oracleStreak[attacker.color]=(state.oracleStreak[attacker.color]||0)+1; state.oracleComboReady[attacker.color]=true; if(state.oracleStreak[attacker.color]>=3){ attacker.diagUnlimited=true; state.oracleStreak[attacker.color]=0; }
    } else { state.oracleStreak[attacker.color]=0; if(attacker.type==='R' && state.oracleComboReady[attacker.color]) state.oracleComboReady[attacker.color]=false; }
    if(attacker.type==='T'){ /* kare döngüsü izleme isteğe bağlı */ }
    if(loseCrown){ state.winner = attacker.color; return { state }; }
  }
  // Tur biter
  state.turn = opp(state.turn);
  return { state };
}

// ====== Server wiring ======
const app = express();
app.use(cors());
const httpServer = http.createServer(app);
const io = new Server(httpServer, { cors: { origin: '*'} });

const rooms = new Map(); // roomId -> { pin, state, players:{W:socketId|null,B:socketId|null} }
const genPin = () => Math.floor(Math.random()*10000).toString().padStart(4,'0');

io.on('connection', (socket)=>{
  socket.on('create_room', ({ pin }, cb)=>{
    const roomId = nanoid(6);
    const roomPin = (pin && String(pin).padStart(4,'0').slice(-4)) || genPin();
    rooms.set(roomId, { pin: roomPin, state: initState(), players: { W: socket.id, B: null } });
    socket.join(roomId); socket.data.roomId = roomId; socket.data.color='W';
    cb?.({ roomId, pin: roomPin, color:'W' });
    io.to(roomId).emit('state', rooms.get(roomId).state);
  });

  socket.on('join_room', ({ roomId, pin }, cb)=>{
    const room = rooms.get(roomId); if(!room) return cb?.({ error:'Room not found' });
    if(String(pin).padStart(4,'0').slice(-4) !== room.pin) return cb?.({ error:'Invalid PIN' });
    const color = room.players.W? (room.players.B? null:'B') : 'W';
    if(!color) return cb?.({ error:'Room full' });
    room.players[color] = socket.id; socket.join(roomId); socket.data.roomId=roomId; socket.data.color=color;
    cb?.({ roomId, pin: room.pin, color });
    io.to(roomId).emit('state', room.state);
  });

  socket.on('make_move', ({ from, to }, cb)=>{
    const room = rooms.get(socket.data.roomId); if(!room) return cb?.({ error:'No room' });
    const { state } = room; const me = socket.data.color;
    if(state.turn !== me) return cb?.({ error:'Not your turn' });
    const p = at(state, from.x, from.y); if(!p || p.color !== me) return cb?.({ error:'Not your piece' });
    const legal = legalMovesFor(state, from.x, from.y).some(m=> m.x===to.x && m.y===to.y);
    if(!legal) return cb?.({ error:'Illegal move' });

    const result = applyMove(state, from, to); room.state = result.state;
    if(result.pendingAttack){
      // saldırı başlamıştır — yalnızca saldıran oyuncuya overlay sinyali
      io.to(socket.id).emit('attack_start', { at: { from, to } });
      return cb?.({ ok:true, pendingAttack:true });
    }
    io.to(socket.data.roomId).emit('state', room.state);
    cb?.({ ok:true });
  });

  socket.on('attack_commit', (_payload, cb)=>{
    const room = rooms.get(socket.data.roomId); if(!room) return cb?.({ error:'No room' });
    if(!room.state.pendingAttack) return cb?.({ error:'No pending attack' });
    // Sunucu zamanına göre çözümlüyoruz
    room.state = resolveAttack(room.state).state;
    io.to(socket.data.roomId).emit('state', room.state);
    cb?.({ ok:true });
  });

  socket.on('disconnect', ()=>{
    const roomId = socket.data.roomId; if(!roomId) return; const room=rooms.get(roomId); if(!room) return;
    if(room.players.W===socket.id) room.players.W=null; if(room.players.B===socket.id) room.players.B=null;
    if(!room.players.W && !room.players.B) rooms.delete(roomId);
  });
});


httpServer.listen(process.env.PORT||3000, ()=> console.log('Flux server on :'+(process.env.PORT||3000)) );

