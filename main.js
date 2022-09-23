const Koa = require('koa');
const { Server, Socket } = require('socket.io');
const http = require('http');

const app = new Koa();

const httpServer = http.createServer(app.callback());
const io = new Server(httpServer, { cors: true });

// 一个房间的映射
const roomMap = new Map();

function exceptionMessage(message) {
    return { success: false, message, data: null };
}

function successMessage(data, message) {
    return { success: true, message, data };
}

io.on('connection', (socket) => {
    socket.once('disconnect', () => {
        const room = socket.belongRoom;
        if (room) {
            // 离开这个房间
            socket.leave(room);
            const roomList = roomMap.get(room);
            if (roomList) {
                // 房间人数为 0，删除房间
                roomList.delete(socket.id);
                if (roomList.size === 0) {
                    roomMap.delete(room);
                }
            }
        }
    });

    socket.on('createRoom', (room, callback) => {

        if (roomMap.has(room)) {
            callback?.(exceptionMessage('房间已存在'));
            return;
        }

        let list = new Set();
        list.add(socket.id);
        roomMap.set(room, list);

        socket.belongRoom = room;
        socket.join(room);

        callback?.(successMessage(room));
    });

    socket.on('joinRoom', async (room, callback) => {

        // 房间号是否合法
        if (typeof room !== 'string' && typeof room !== 'number') {
            callback?.(exceptionMessage('房间 ID 不合法'));
            return;
        }

        // 判断是否有这个房间
        if (!roomMap.has(room)) {
            callback?.(exceptionMessage('房间不存在'));
            return;
        }

        // 判断是否有这个房间
        if (socket.belongRoom) {
            callback?.(exceptionMessage(socket.belongRoom === room ? '已在这个房间' : '已加入其他房间'));
            return;
        }

        // 房间是否满人
        if (roomMap.get(room).size >= 2) {
            callback?.(exceptionMessage('房间已满人'));
            return;
        }

        socket.join(room);
        roomMap.get(room).add(socket.id);

        // 把房间名称保存在实例
        socket.belongRoom = room;
        // 通知客户端
        callback?.({ success: true, message: `加入房间：${room} 成功` });
        // 告知别的客户端，加入成功
        socket.broadcast.emit('syncAction', { type: 'unlock' });
    });

    socket.on('flipGrid', (message, callback) => {
        if (socket.belongRoom) {
            socket.broadcast.emit('flipGrid', successMessage(message));
            callback?.(successMessage());
        }
    });

    socket.on('gameOver', () => {
        socket.broadcast.emit('gameOver');
    });

    socket.on('shareMap', (map) => {
        socket.broadcast.emit('shareMap', map);
    });

    socket.on('unlock', () => {
        socket.broadcast.emit('unlock');
    });

    socket.on('syncAction', (message) => {
        socket.broadcast.emit('syncAction', message);
    });
});

httpServer.listen(2333, '0.0.0.0');
