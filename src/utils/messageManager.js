class MessageManager {
    constructor(bot) {
        this.bot = bot;
        this.lastMessageIds = new Map();
        this.lastMainMenuMessageId = null;
        this.lastWelcomeMessageId = null;
        this.lastExportMessageId = null;
    }

    async deletePreviousMessages(chatId) {
        // Delete regular messages
        const lastMessageId = this.lastMessageIds.get(chatId);
        if (lastMessageId) {
            try {
                await this.bot.deleteMessage(chatId, lastMessageId);
            } catch (error) {
                // Only log if it's not a "message not found" error
                if (!error.message.includes('message to delete not found')) {
                    console.error('Error deleting previous message:', error);
                }
                // Clear the stored message ID since it's no longer valid
                this.lastMessageIds.delete(chatId);
            }
        }

        // Delete export message
        if (this.lastExportMessageId) {
            try {
                await this.bot.deleteMessage(chatId, this.lastExportMessageId);
            } catch (error) {
                if (!error.message.includes('message to delete not found')) {
                    console.error('Error deleting export message:', error);
                }
                this.lastExportMessageId = null;
            }
        }

        // Delete welcome message
        if (this.lastWelcomeMessageId) {
            try {
                await this.bot.deleteMessage(chatId, this.lastWelcomeMessageId);
            } catch (error) {
                if (!error.message.includes('message to delete not found')) {
                    console.error('Error deleting welcome message:', error);
                }
                this.lastWelcomeMessageId = null;
            }
        }
    }

    async cleanupAllMessages(chatId) {
        try {
            // Get the last 100 messages in the chat
            const messages = await this.bot.getUpdates({
                offset: -1,
                limit: 100
            });

            // Delete all messages from this bot in the chat
            for (const message of messages) {
                if (message.message && message.message.chat.id === chatId) {
                    try {
                        await this.bot.deleteMessage(chatId, message.message.message_id);
                    } catch (error) {
                        if (!error.message.includes('message to delete not found')) {
                            console.error('Error deleting message:', error);
                        }
                    }
                }
            }

            // Reset all message tracking variables
            this.lastMessageIds.delete(chatId);
            this.lastMainMenuMessageId = null;
            this.lastWelcomeMessageId = null;
            this.lastExportMessageId = null;
        } catch (error) {
            console.error('Error cleaning up messages:', error);
        }
    }

    async sendAndStoreMessage(chatId, message, options = {}, reconnectBot) {
        try {
            // Always delete previous messages
            await this.deletePreviousMessages(chatId);
            
            // Add retry logic for sending messages
            let retries = 3;
            let lastError;
            
            while (retries > 0) {
                try {
                    const sentMessage = await this.bot.sendMessage(chatId, message, options);
                    this.lastMessageIds.set(chatId, sentMessage.message_id);
                    return sentMessage;
                } catch (error) {
                    lastError = error;
                    console.error(`Error sending message (attempts left: ${retries}):`, error.message);
                    
                    if (error.code === 'EFATAL' || error.code === 'ECONNRESET' || error.code === 'ETIMEDOUT') {
                        // Wait before retrying
                        await new Promise(resolve => setTimeout(resolve, 2000));
                        retries--;
                    } else {
                        // For other errors, don't retry
                        throw error;
                    }
                }
            }
            
            // If all retries failed, try to reconnect
            if (lastError && reconnectBot) {
                console.error('All retry attempts failed, attempting to reconnect...');
                await reconnectBot();
                // Try one final time after reconnection
                const sentMessage = await this.bot.sendMessage(chatId, message, options);
                this.lastMessageIds.set(chatId, sentMessage.message_id);
                return sentMessage;
            }
        } catch (error) {
            console.error('Fatal error in sendAndStoreMessage:', error);
            // Try to send a simple error message without options
            try {
                await this.bot.sendMessage(chatId, 'Sorry, there was an error processing your request. Please try again.');
            } catch (finalError) {
                console.error('Failed to send error message:', finalError);
            }
            throw error;
        }
    }

    async editMessageOrSend(chatId, message, options = {}, messageId = null) {
        if (messageId) {
            try {
                await this.bot.editMessageText(message, {
                    chat_id: chatId,
                    message_id: messageId,
                    ...options
                });
                return { message_id: messageId };
            } catch (error) {
                // If edit fails, send new message
                const sentMessage = await this.bot.sendMessage(chatId, message, options);
                return sentMessage;
            }
        } else {
            const sentMessage = await this.bot.sendMessage(chatId, message, options);
            return sentMessage;
        }
    }
}

module.exports = MessageManager;
