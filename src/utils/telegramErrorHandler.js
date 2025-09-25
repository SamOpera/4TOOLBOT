/**
 * Telegram Bot API Error Handler Utility
 * Provides consistent error handling for all handlers
 */

class TelegramErrorHandler {
    static async sendMessage(bot, chatId, message, options = {}, lastMessageIds = null) {
        try {
            const sentMessage = await bot.sendMessage(chatId, message, options);
            if (lastMessageIds) {
                lastMessageIds.set(chatId, sentMessage.message_id);
            }
            return sentMessage;
        } catch (error) {
            console.error('Error sending message:', error.code || error.message);
            
            // Handle network errors gracefully
            if (this.isNetworkError(error)) {
                console.log('Network error detected, operation completed but message not sent');
                return { message_id: Date.now() };
            }
            
            // Try to send a simplified message without formatting if the original failed
            if (options.parse_mode) {
                try {
                    console.log('Retrying message without parse_mode...');
                    const simplifiedMessage = this.simplifyMessage(message);
                    const sentMessage = await bot.sendMessage(chatId, simplifiedMessage, {
                        reply_markup: options.reply_markup // Keep the keyboard if present
                    });
                    if (lastMessageIds) {
                        lastMessageIds.set(chatId, sentMessage.message_id);
                    }
                    return sentMessage;
                } catch (retryError) {
                    console.error('Failed to send simplified message:', retryError.code || retryError.message);
                    
                    // Handle network errors on retry as well
                    if (this.isNetworkError(retryError)) {
                        console.log('Network error on retry, operation completed but message not sent');
                        return { message_id: Date.now() };
                    }
                }
            }
            
            // Last resort: try to send a basic error message
            try {
                const fallbackMessage = await bot.sendMessage(chatId, 'Operation completed but message could not be sent due to connection issues.');
                if (lastMessageIds) {
                    lastMessageIds.set(chatId, fallbackMessage.message_id);
                }
                return fallbackMessage;
            } catch (finalError) {
                console.error('Complete failure to send any message:', finalError.code || finalError.message);
                
                // Handle network errors on final try
                if (this.isNetworkError(finalError)) {
                    console.log('Network error on fallback message, giving up gracefully');
                    return { message_id: Date.now() };
                }
                
                // Re-throw non-network errors
                throw finalError;
            }
        }
    }

    static isNetworkError(error) {
        const networkErrorCodes = ['EFATAL', 'ENOTFOUND', 'ECONNRESET', 'ETIMEDOUT', 'ECONNREFUSED', 'ENETUNREACH'];
        return networkErrorCodes.includes(error.code) || 
               (error.message && error.message.includes('AggregateError')) ||
               (error.message && error.message.includes('network'));
    }

    static simplifyMessage(message) {
        // Remove markdown formatting and special characters
        return message
            .replace(/\*/g, '')      // Remove bold
            .replace(/_/g, '')       // Remove italic
            .replace(/`/g, '')       // Remove code
            .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')  // Convert links to text
            .replace(/#{1,6}\s/g, '') // Remove headers
            .replace(/[_*[\]()~>#+=|{}.!-]/g, ''); // Remove other special chars
    }
}

module.exports = TelegramErrorHandler;
