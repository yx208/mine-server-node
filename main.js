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
            const roomInfo = roomMap.get(room);
            if (roomInfo) {
                roomInfo.count--;
                roomInfo.users.delete(socket.id);
                if (roomInfo.count === 0) {
                    roomMap.delete(room);
                } else /* 其中一个退出游戏 */ {
                    io.in(room).emit('gameClose');
                }
            }
        }
    });

    socket.on('createRoom', (message, callback) => {

        const { room, row, col } = message;

        if (roomMap.has(room)) {
            callback?.(exceptionMessage('房间已存在'));
            return;
        }

        const list = new Set(); list.add(socket.id);
        roomMap.set(room, {
            layout: { row, col },
            count: 1,
            users: list
        });

        socket.belongRoom = room;
        socket.join(room);

        callback?.(successMessage(room));
    });

    socket.on('joinRoom', async (message, callback) => {

        const { room } = message

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

        // 判断是否加入房间
        if (socket.belongRoom) {
            callback?.(exceptionMessage(socket.belongRoom === room ? '已在这个房间' : '已加入其他房间'));
            return;
        }

        // 房间是否满人
        if (roomMap.get(room).count >= 2) {
            callback?.(exceptionMessage('房间已满人'));
            return;
        }

        socket.join(room);
        roomMap.get(room).count++;
        roomMap.get(room).users.add(socket.id);

        // 把房间名称保存在实例
        socket.belongRoom = room;
        // 通知客户端
        callback?.({ success: true, message: `加入房间：${room} 成功` });
        // 告知别的客户端，加入成功
        socket.broadcast.emit('syncAction', { type: 'unlock' });
    });

    socket.on('reset', (layout) => {
        socket.broadcast.emit('reset', layout);
    });

    socket.on('syncAction', (message) => {
        socket.broadcast.emit('syncAction', message);
    });

});

httpServer.listen(2333);
