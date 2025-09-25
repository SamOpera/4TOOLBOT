// Main handlers index file
const WalletHandlers = require('./walletHandlers');
const WalletHoldingsHandlers = require('./walletHoldingsHandlers');
const PortfolioHandlers = require('./portfolioHandlers');
const TradingHandlers = require('./tradingHandlers');
const StrategyHandlers = require('./strategyHandlers');
const RuleHandlers = require('./ruleHandlers');
const ExportHandlers = require('./exportHandlers');
const SecurityHandlers = require('./securityHandlers');
const CopyTradeHandlers = require('./copyTradeHandlers');
const SettingsHandlers = require('./settingsHandlers');

module.exports = {
    WalletHandlers,
    WalletHoldingsHandlers,
    PortfolioHandlers,
    TradingHandlers,
    StrategyHandlers,
    RuleHandlers,
    ExportHandlers,
    SecurityHandlers,
    CopyTradeHandlers,
    SettingsHandlers
};
