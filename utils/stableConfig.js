/**
 * Stable tokens supported by PayCrest for the onramp pipeline.
 *
 * These are the tokens PayCrest can accept for fiat conversion.
 * The keys are FixedFloat network codes; values are PayCrest network codes.
 *
 * Supported combos (PayCrest confirmed):
 *   USDT on Ethereum   (ETH)
 *   USDC on Ethereum   (ETH)
 *   USDT on Polygon    (MATIC)
 *   USDC on Polygon    (MATIC)
 *   USDT on BNB Chain  (BSC)
 *   USDC on BNB Chain  (BSC)
 *   USDT on Base       (BASE)
 *   USDC on Base       (BASE)
 *   USDT on Arbitrum   (ARBITRUM)
 *   USDC on Arbitrum   (ARBITRUM)
 */

// FixedFloat currency code → PayCrest token name
const FF_CURRENCY_TO_PC_TOKEN = {
	"USDTETH": { token: "USDT", network: "ethereum" },
	"USDCETH": { token: "USDC", network: "ethereum" },
	"USDTMATIC": { token: "USDT", network: "polygon" },
	"USDCMATIC": { token: "USDC", network: "polygon" },
	"USDTBSC": { token: "USDT", network: "bnb-smart-chain" },
	"USDCBSC": { token: "USDC", network: "bnb-smart-chain" },
	"USDTBASE": { token: "USDT", network: "base" },
	"USDCBASE": { token: "USDC", network: "base" },
	"USDTARB": { token: "USDT", network: "arbitrum" },
	"USDCARB":  { token: "USDC", network: "arbitrum" },
};

/**
 * The best target stablecoin to use for a given user preference + network.
 * We prefer USDT on BNB for lowest fees, but USDC on Ethereum is also fine.
 * This is the default when the user doesn't specify.
 */
const DEFAULT_STABLE_TARGET = {
	ffCurrency: "USDTBSC",  // FixedFloat: USDT on BSC (lowest fees)
	token: "USDT",
	network: "bnb-smart-chain",
};

/**
 * All valid FixedFloat output currencies for the stablecoin leg
 */
const VALID_FF_STABLE_CURRENCIES = Object.keys(FF_CURRENCY_TO_PC_TOKEN);

/**
 * Given a FixedFloat output currency (e.g. "USDTBSC"),
 * returns the PayCrest token+network config.
 *
 * @param {string} ffCurrency - e.g. "USDTBSC", "USDTETH", "USDCMATIC"
 * @returns {{ token: string, network: string } | null}
 */
function getPayCrestConfig(ffCurrency) {
	return FF_CURRENCY_TO_PC_TOKEN[ffCurrency?.toUpperCase()] || null;
}

/**
 * Returns true if the given FixedFloat currency code is a supported stable
 */
function isSupportedStable(ffCurrency) {
	return ffCurrency?.toUpperCase() in FF_CURRENCY_TO_PC_TOKEN;
}

module.exports = {
	FF_CURRENCY_TO_PC_TOKEN,
	DEFAULT_STABLE_TARGET,
	VALID_FF_STABLE_CURRENCIES,
	getPayCrestConfig,
	isSupportedStable,
};
