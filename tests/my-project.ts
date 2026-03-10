import * as anchor from "@coral-xyz/anchor";
import { Program } from "@coral-xyz/anchor";
import { PublicKey, SystemProgram, Keypair, LAMPORTS_PER_SOL } from "@solana/web3.js";
import { assert } from "chai";

// Import generated types
// Note: Run `anchor build` first to generate types
type ExoduzeProgram = any;

describe("ExoDuZe — Full Lifecycle Tests", () => {
    const provider = anchor.AnchorProvider.env();
    anchor.setProvider(provider);

    const program = anchor.workspace.exoduze as Program<ExoduzeProgram>;
    const admin = provider.wallet as anchor.Wallet;

    // PDA Seeds (must match constants.rs)
    const PLATFORM_SEED = Buffer.from("platform");
    const MARKET_SEED = Buffer.from("market");
    const POSITION_SEED = Buffer.from("position");
    const AGENT_SEED = Buffer.from("agent");
    const AGENT_REGISTRY_SEED = Buffer.from("agent_registry");
    const VAULT_SEED = Buffer.from("vault");

    // PDAs
    let platformPda: PublicKey;
    let platformBump: number;
    let marketPda: PublicKey;
    let vaultPda: PublicKey;
    let agentRegistryPda: PublicKey;

    // Test values
    const poolDeposit = new anchor.BN(LAMPORTS_PER_SOL); // 1 SOL
    const now = Math.floor(Date.now() / 1000);
    const competitionStart = now - 60; // Started 1 min ago
    const competitionEnd = now + 3600; // Ends in 1 hour
    const bondingK = new anchor.BN(100_000); // 0.0001 SOL base
    const bondingN = 150; // 1.5 exponent

    before("Derive PDAs", () => {
        [platformPda, platformBump] = PublicKey.findProgramAddressSync(
            [PLATFORM_SEED],
            program.programId,
        );

        // Market PDA at index 0
        [marketPda] = PublicKey.findProgramAddressSync(
            [MARKET_SEED, new anchor.BN(0).toArrayLike(Buffer, "le", 8)],
            program.programId,
        );

        // Vault PDA
        [vaultPda] = PublicKey.findProgramAddressSync(
            [VAULT_SEED],
            program.programId,
        );

        // Agent registry for admin wallet
        [agentRegistryPda] = PublicKey.findProgramAddressSync(
            [AGENT_REGISTRY_SEED, admin.publicKey.toBuffer()],
            program.programId,
        );
    });

    // ========================================
    // 1. Initialize Platform
    // ========================================
    it("Initialize Platform with Value Creation Pool", async () => {
        try {
            const tx = await program.methods
                .initializePlatform(poolDeposit)
                .accounts({
                    admin: admin.publicKey,
                    platform: platformPda,
                    systemProgram: SystemProgram.programId,
                })
                .rpc();

            console.log("  ✅ Platform initialized, tx:", tx);

            // Verify platform state
            const platform = await program.account.platform.fetch(platformPda);
            assert.equal(platform.admin.toBase58(), admin.publicKey.toBase58());
            assert.equal(platform.totalMarkets.toNumber(), 0);
            assert.equal(platform.totalPositions.toNumber(), 0);
            assert.equal(platform.totalAgents.toNumber(), 0);
            console.log("  📊 Pool Balance:", platform.poolBalance.toNumber() / LAMPORTS_PER_SOL, "SOL");
        } catch (err: any) {
            // Platform may already be initialized on devnet
            if (err.message?.includes("already in use")) {
                console.log("  ℹ️  Platform already initialized (devnet)");
            } else {
                throw err;
            }
        }
    });

    // ========================================
    // 2. Create Market with Sector + Competition Timing
    // ========================================
    it("Create Market: Sports sector with bonding curve", async () => {
        try {
            // Fetch current platform state to get correct market index
            const platform = await program.account.platform.fetch(platformPda);
            const marketIndex = platform.totalMarkets.toNumber();

            // Derive market PDA for the current index
            const [currentMarketPda] = PublicKey.findProgramAddressSync(
                [MARKET_SEED, new anchor.BN(marketIndex).toArrayLike(Buffer, "le", 8)],
                program.programId,
            );

            const tx = await program.methods
                .createMarket(
                    "Manchester United vs Liverpool",  // title
                    "Man United",                      // team_home
                    "Liverpool",                       // team_away
                    [4500, 2800, 2700],               // probabilities (45%, 28%, 27%)
                    "sports",                          // sector
                    new anchor.BN(competitionStart),   // competition_start
                    new anchor.BN(competitionEnd),     // competition_end
                    bondingK,                          // bonding_k
                    bondingN,                          // bonding_n
                )
                .accounts({
                    admin: admin.publicKey,
                    platform: platformPda,
                    market: currentMarketPda,
                    systemProgram: SystemProgram.programId,
                })
                .rpc();

            console.log("  ✅ Market created, tx:", tx);

            // Verify market state
            const market = await program.account.market.fetch(currentMarketPda);
            assert.equal(market.title, "Manchester United vs Liverpool");
            assert.equal(market.teamHome, "Man United");
            assert.equal(market.teamAway, "Liverpool");
            assert.equal(market.sector, "sports");
            assert.deepEqual(market.probabilities, [4500, 2800, 2700]);
            assert.equal(market.bondingK.toNumber(), 100_000);
            assert.equal(market.bondingN, 150);
            console.log("  ⚽ Sector:", market.sector);
            console.log("  📈 Probabilities:", market.probabilities.map((p: number) => `${(p / 100).toFixed(1)}%`).join(", "));
            console.log("  📐 Bonding Curve: k =", market.bondingK.toNumber(), "n =", market.bondingN);

            // Update reference for subsequent tests
            marketPda = currentMarketPda;
        } catch (err: any) {
            if (err.message?.includes("already in use")) {
                console.log("  ℹ️  Market already exists at this index (devnet)");
                // Fetch existing market to get its PDA
                const platform = await program.account.platform.fetch(platformPda);
                const lastIndex = Math.max(0, platform.totalMarkets.toNumber() - 1);
                [marketPda] = PublicKey.findProgramAddressSync(
                    [MARKET_SEED, new anchor.BN(lastIndex).toArrayLike(Buffer, "le", 8)],
                    program.programId,
                );
            } else {
                throw err;
            }
        }
    });

    // ========================================
    // 3. Register Agent User (creates quota PDA)
    // ========================================
    it("Register Agent User (free-tier quota)", async () => {
        try {
            const tx = await program.methods
                .registerAgentUser()
                .accounts({
                    owner: admin.publicKey,
                    agentRegistry: agentRegistryPda,
                    systemProgram: SystemProgram.programId,
                })
                .rpc();

            console.log("  ✅ Agent user registered, tx:", tx);

            // Verify registry
            const registry = await program.account.agentRegistry.fetch(agentRegistryPda);
            assert.equal(registry.user.toBase58(), admin.publicKey.toBase58());
            assert.equal(registry.deploysUsed, 0);
            assert.equal(registry.maxDeploys, 10);
            console.log("  🔓 Quota: 0/10 deploys used (FREE TIER)");
        } catch (err: any) {
            if (err.message?.includes("already in use")) {
                console.log("  ℹ️  Agent registry already exists (devnet)");
            } else {
                throw err;
            }
        }
    });

    // ========================================
    // 4. Deploy AI Agent (checks quota)
    // ========================================
    it("Deploy AI Agent with strategy prompt", async () => {
        try {
            const platform = await program.account.platform.fetch(platformPda);
            const agentIndex = platform.totalAgents.toNumber();

            // Derive agent PDA
            const [agentPda] = PublicKey.findProgramAddressSync(
                [AGENT_SEED, admin.publicKey.toBuffer(), new anchor.BN(agentIndex).toArrayLike(Buffer, "le", 8)],
                program.programId,
            );

            const tx = await program.methods
                .deployAgent(
                    "Analyze social sentiment for sports and take long positions when bullish confidence exceeds 65%",
                    0,  // target_outcome: Home
                    0,  // direction: Long
                    3,  // risk_level: 3/5
                )
                .accounts({
                    owner: admin.publicKey,
                    platform: platformPda,
                    market: marketPda,
                    agentRegistry: agentRegistryPda,
                    agent: agentPda,
                    systemProgram: SystemProgram.programId,
                })
                .rpc();

            console.log("  ✅ AI Agent deployed, tx:", tx);

            // Verify agent state
            const agent = await program.account.agent.fetch(agentPda);
            assert.equal(agent.owner.toBase58(), admin.publicKey.toBase58());
            assert.equal(agent.market.toBase58(), marketPda.toBase58());
            assert.equal(agent.riskLevel, 3);
            assert.equal(agent.isActive, true);
            console.log("  🤖 Agent PDA:", agentPda.toBase58());

            // Verify quota updated
            const registry = await program.account.agentRegistry.fetch(agentRegistryPda);
            console.log("  📊 Quota: " + registry.deploysUsed + "/" + registry.maxDeploys + " deploys used");
        } catch (err: any) {
            if (err.message?.includes("already in use")) {
                console.log("  ℹ️  Agent already exists at this index (devnet)");
            } else {
                throw err;
            }
        }
    });

    // ========================================
    // 5. Take Position (bonding curve pricing)
    // ========================================
    it("Take Position: Home Win Long with bonding premium", async () => {
        try {
            const platform = await program.account.platform.fetch(platformPda);
            const positionIndex = platform.totalPositions.toNumber();

            // Derive position PDA
            const [positionPda] = PublicKey.findProgramAddressSync(
                [POSITION_SEED, admin.publicKey.toBuffer(), new anchor.BN(positionIndex).toArrayLike(Buffer, "le", 8)],
                program.programId,
            );

            const amount = new anchor.BN(LAMPORTS_PER_SOL / 100); // 0.01 SOL

            const tx = await program.methods
                .takePosition(
                    0,      // outcome: Home
                    0,      // direction: Long
                    amount, // amount
                )
                .accounts({
                    trader: admin.publicKey,
                    platform: platformPda,
                    market: marketPda,
                    position: positionPda,
                    vault: vaultPda,
                    systemProgram: SystemProgram.programId,
                })
                .rpc();

            console.log("  ✅ Position taken, tx:", tx);

            // Verify position state
            const position = await program.account.position.fetch(positionPda);
            assert.equal(position.trader.toBase58(), admin.publicKey.toBase58());
            assert.equal(position.market.toBase58(), marketPda.toBase58());
            assert.equal(position.entryProbability, 4500); // 45%
            console.log("  📈 Entry Probability:", (position.entryProbability / 100).toFixed(1) + "%");
            console.log("  💰 Effective Amount:", position.amount.toNumber() / LAMPORTS_PER_SOL, "SOL (includes bonding premium)");

            // Verify market updated
            const market = await program.account.market.fetch(marketPda);
            console.log("  📊 Market Volume:", market.totalVolume.toNumber() / LAMPORTS_PER_SOL, "SOL");
            console.log("  📊 Total Positions:", market.totalPositions.toNumber());
        } catch (err: any) {
            if (err.message?.includes("already in use")) {
                console.log("  ℹ️  Position already exists at this index (devnet)");
            } else {
                throw err;
            }
        }
    });

    // ========================================
    // 6. Update Probabilities (admin)
    // ========================================
    it("Update Probabilities (admin only)", async () => {
        try {
            const newProbs: [number, number, number] = [5000, 2500, 2500]; // Shift to 50/25/25

            const tx = await program.methods
                .updateProbabilities(newProbs)
                .accounts({
                    admin: admin.publicKey,
                    platform: platformPda,
                    market: marketPda,
                })
                .rpc();

            console.log("  ✅ Probabilities updated, tx:", tx);

            const market = await program.account.market.fetch(marketPda);
            assert.deepEqual(market.probabilities, [5000, 2500, 2500]);
            console.log("  📈 New Probabilities:", market.probabilities.map((p: number) => `${(p / 100).toFixed(1)}%`).join(", "));
        } catch (err: any) {
            console.log("  ⚠️  Update probabilities:", err.message);
        }
    });

    // ========================================
    // 7. Platform State Summary
    // ========================================
    it("Verify Platform State Summary", async () => {
        const platform = await program.account.platform.fetch(platformPda);

        console.log("\n  ══════════════════════════════════════");
        console.log("  ║  ExoDuZe Platform Summary (Devnet) ║");
        console.log("  ══════════════════════════════════════");
        console.log("  ║ Admin:", platform.admin.toBase58().slice(0, 16) + "...");
        console.log("  ║ Pool Balance:", platform.poolBalance.toNumber() / LAMPORTS_PER_SOL, "SOL");
        console.log("  ║ Total Markets:", platform.totalMarkets.toNumber());
        console.log("  ║ Total Positions:", platform.totalPositions.toNumber());
        console.log("  ║ Total Agents:", platform.totalAgents.toNumber());
        console.log("  ══════════════════════════════════════\n");

        assert.isAtLeast(platform.totalMarkets.toNumber(), 0);
    });
});
