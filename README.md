# mint

The NFT that hedges against the stock market. Every mint is a Metaplex Core NFT whose own signer address holds a vault of Gold xStock (GLDx) and USDC, plus an optional S&P 500 crash bet on Polymarket via Jupiter, held in the minter's wallet.

Static site + one Vercel function (`api/mint.js`, region fra1). Every transaction is built server-side and signed in the user's wallet.
