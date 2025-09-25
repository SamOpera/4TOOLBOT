class MessageDispatcher {
    constructor(bot, { maxConcurrent = 10, minIntervalMs = 35 } = {}) {
        this.bot = bot;
        this.maxConcurrent = maxConcurrent;
        this.minIntervalMs = minIntervalMs; // ~30 req/s cap
        this.queue = [];
        this.active = 0;
        this.lastSentAt = 0;
    }

    async _throttle() {
        const now = Date.now();
        const elapsed = now - this.lastSentAt;
        if (elapsed < this.minIntervalMs) {
            await new Promise(r => setTimeout(r, this.minIntervalMs - elapsed));
        }
        this.lastSentAt = Date.now();
    }

    _dequeue() {
        while (this.active < this.maxConcurrent && this.queue.length > 0) {
            const task = this.queue.shift();
            this._run(task);
        }
    }

    async _run(task) {
        this.active++;
        try {
            await this._throttle();
            const res = await this.bot.sendMessage(task.chatId, task.message, task.options);
            task.resolve(res);
        } catch (error) {
            // Retry transient errors
            if ((error.code === 'EFATAL' || error.code === 'ECONNRESET' || error.code === 'ETIMEDOUT') && task.retries < 3) {
                task.retries++;
                setTimeout(() => {
                    this.queue.unshift(task);
                    this._dequeue();
                }, 500 * task.retries);
            } else {
                task.reject(error);
            }
        } finally {
            this.active--;
            this._dequeue();
        }
    }

    send(chatId, message, options = {}) {
        return new Promise((resolve, reject) => {
            const task = { chatId, message, options, resolve, reject, retries: 0 };
            this.queue.push(task);
            this._dequeue();
        });
    }
}

module.exports = MessageDispatcher;

