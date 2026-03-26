import { expect } from "chai";
import { describe } from "mocha";
import * as fs from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'url';
import hre from "hardhat";
const { ethers } = await hre.network.connect();

// Sepolia 网络上的 USDC 合约地址
const SEPOLIA_USDC_ADDRESS = "0x1c7D4B196Cb0C7B01d743Fbc6116a902379C7238";

// 获取当前文件的目录路径（替代 __dirname）
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// 缓存目录和文件路径
const CACHE_DIR = path.join(__dirname, '.cache');
const CACHE_FILE = path.join(CACHE_DIR, 'contracts.json');

// 缓存数据接口
interface ContractCache {
    nftAuctionAddress: string;
    nftAuctionFactoryAddress: string;
    testNFTAddress: string;
    proxyAddress: string;
}

// 确保缓存目录存在
function ensureCacheDir() {
    if (!fs.existsSync(CACHE_DIR)) {
        fs.mkdirSync(CACHE_DIR, { recursive: true });
    }
}

// 读取缓存
function readCache(): ContractCache | null {
    try {
        if (fs.existsSync(CACHE_FILE)) {
            const data = fs.readFileSync(CACHE_FILE, 'utf-8');
            return JSON.parse(data);
        }
    } catch (error) {
        console.log("读取缓存失败:", error);
    }
    return null;
}

// 保存缓存
function saveCache(cache: ContractCache) {
    ensureCacheDir();
    fs.writeFileSync(CACHE_FILE, JSON.stringify(cache, null, 2));
    console.log("缓存已保存到:", CACHE_FILE);
}

/**
 * 辅助函数：从交易收据中获取事件参数
 * 这是获取事件最可靠的方式，不依赖实时监听
 * @param contract 合约实例
 * @param eventName 事件名称
 * @returns 事件参数数组
 */
async function getEventFromReceipt(contract: any, tx: any, eventName: string): Promise<any[]> {
    const receipt = await tx.wait();
    console.log(`交易已确认，区块号: ${receipt.blockNumber}`);

    // 解析交易收据中的事件
    const events = receipt.logs.map((log: any) => {
        try {
            return contract.interface.parseLog(log);
        } catch (e) {
            return null;
        }
    }).filter((event: any) => event !== null);

    console.log(`找到 ${events.length} 个事件`);
    events.forEach((event: any, index: number) => {
        console.log(`事件 ${index + 1}: ${event.name}`);
    });

    // 查找目标事件
    const targetEvent = events.find((event: any) => event.name === eventName);
    if (!targetEvent) {
        throw new Error(`在交易收据中未找到 ${eventName} 事件`);
    }

    console.log(`${eventName} 事件找到，参数:`, targetEvent.args);
    return targetEvent.args;
}



describe("NFTAuctionFactory (Sepolia)", function () {
    // 工厂逻辑合约地址
    let nftAuctionFactoryAddress: string;
    // 工厂逻辑合约实例
    let nftAuctionFactory: any;
    // 拍卖逻辑合约地址
    let nftAuctionAddress: string;
    // 拍卖逻辑合约实例
    let nftAuction: any;
    // 测试NFT合约地址
    let testNFTAddress: string;
    // NFT 合约实例
    let testNFT: any;
    // USDC 合约实例
    let usdc: any;
    // 工厂代理合约地址
    let proxyAddress: string;
    // 工厂代理合约实例
    let nftAuctionFactoryProxy: any;
    let owner: any;
    let seller: any;
    let buyer1: any;
    let buyer2: any;
    let platform: any;

    before(async function () {
        // 准备测试账户
        [owner, seller, buyer1, buyer2, platform] = await ethers.getSigners();
        console.log("测试账户准备完成:");
        console.log("- 部署账户:", owner.address);
        console.log("- 卖家:", seller.address);
        console.log("- 买家1:", buyer1.address);
        console.log("- 买家2:", buyer2.address);
        console.log("- 平台:", platform.address);

        // 尝试读取缓存
        const cache = readCache();

        if (cache) {
            console.log("\n=== 从缓存加载合约地址 ===");
            nftAuctionAddress = cache.nftAuctionAddress;
            nftAuctionFactoryAddress = cache.nftAuctionFactoryAddress;
            testNFTAddress = cache.testNFTAddress;
            proxyAddress = cache.proxyAddress;

            console.log("NFTAuction 地址:", nftAuctionAddress);
            console.log("NFTAuctionFactory 地址:", nftAuctionFactoryAddress);
            console.log("TestNFT 地址:", testNFTAddress);
            console.log("NFTAuctionFactory Proxy 地址:", proxyAddress);

            // 获取合约实例
            const NFTAuctionFactory = await ethers.getContractFactory("NFTAuction");
            nftAuction = NFTAuctionFactory.attach(nftAuctionAddress);

            const NFTAuctionFactoryFactory = await ethers.getContractFactory("NFTAuctionFactory");
            nftAuctionFactory = NFTAuctionFactoryFactory.attach(nftAuctionFactoryAddress);
            nftAuctionFactoryProxy = NFTAuctionFactoryFactory.attach(proxyAddress);

            const TestNFTFactory = await ethers.getContractFactory("TestNFT");
            testNFT = TestNFTFactory.attach(testNFTAddress);

            console.log("合约实例加载完成！");
        } else {
            console.log("\n=== 缓存不存在，开始部署合约 ===");

            // 部署 NFTAuction 逻辑合约
            const NFTAuctionFactory = await ethers.getContractFactory("NFTAuction");
            nftAuction = await NFTAuctionFactory.deploy();
            await nftAuction.waitForDeployment();
            nftAuctionAddress = await nftAuction.getAddress();
            console.log("部署 NFTAuction 逻辑合约完成:", nftAuctionAddress);

            // 部署 NFTAuctionFactory 逻辑合约
            const NFTAuctionFactoryFactory = await ethers.getContractFactory("NFTAuctionFactory");
            nftAuctionFactory = await NFTAuctionFactoryFactory.deploy();
            await nftAuctionFactory.waitForDeployment();
            nftAuctionFactoryAddress = await nftAuctionFactory.getAddress();
            console.log("部署 NFTAuctionFactory 逻辑合约完成:", nftAuctionFactoryAddress);

            // 部署 TestNFT 合约
            const TestNFTFactory = await ethers.getContractFactory("TestNFT");
            testNFT = await TestNFTFactory.deploy();
            await testNFT.waitForDeployment();
            testNFTAddress = await testNFT.getAddress();
            console.log("部署 TestNFT 合约完成:", testNFTAddress);

            // 设置拍卖工厂初始化数据
            const initData = NFTAuctionFactoryFactory.interface.encodeFunctionData("initialize", [
                platform.address, // _feeReceiver平台手续费收款地址
                200,   //百分之2手续费
                nftAuctionAddress   //NFT拍卖合约地址
            ]);

            // 部署代理合约
            const ERC1967Proxy = await ethers.getContractFactory("ERC1967Proxy");
            const proxy = await ERC1967Proxy.deploy(
                nftAuctionFactoryAddress,
                initData
            );
            await proxy.waitForDeployment();
            proxyAddress = await proxy.getAddress();
            console.log("NFTAuctionFactory 代理合约地址:", proxyAddress);

            // 拍卖工程代理合约
            nftAuctionFactoryProxy = NFTAuctionFactoryFactory.attach(proxyAddress);
            console.log("NFTAuctionFactory 代理合约部署并初始化完成！");

            // 保存缓存
            const cacheData: ContractCache = {
                nftAuctionAddress,
                nftAuctionFactoryAddress,
                testNFTAddress,
                proxyAddress
            };
            saveCache(cacheData);
        }

        // 使用 Sepolia 网络上的现有 USDC 合约
        usdc = await ethers.getContractAt("USDC", SEPOLIA_USDC_ADDRESS);
        console.log("使用 Sepolia 网络上的 USDC 合约:", SEPOLIA_USDC_ADDRESS);
    });

    it("测试完整拍卖流程", async function () {
        //放大超时时间因为Sepolia测试还要加部署时间特别长
        this.timeout(120000 * 20);

        // 读取缓存获取 lastTokenId
        const cache = readCache();
        if (!cache) {
            throw new Error("缓存不存在,请先整体运行describe(npx hardhat test test/sepolia/NFTAuctionFactorySepolia.ts --network sepolia --coverage)");
        }

        console.log("\n=== 铸NFT币 ===");
        // 铸造NFT给卖家
        const tokenURI = "https://ipfs.io/ipfs/QmeMndgj4espSyREWbnefEBV8JkE1HjmvYMPy3Zfpr92Kd";
        // 执行实际的铸造交易
        const mintTx = await testNFT.safeMint(seller.address, tokenURI);
        // 从交易收据中获取 Minted 事件参数
        const [to, tokenId, uri] = await getEventFromReceipt(testNFT, mintTx, "Minted");
        console.log("新的NFT tokenId:", tokenId.toString());
        console.log("NFT接收地址:", to);
        console.log("NFT元数据URI:", uri);

        // 检查卖家是否拥有该NFT(是否铸币成功)
        const ownerOfToken = await testNFT.ownerOf(tokenId);
        console.log("NFT当前所有者:", ownerOfToken);
        //断言卖家是否是tokenId的所有者
        expect(ownerOfToken.toLowerCase()).to.equal(seller.address.toLowerCase());


        // 卖家授权NFT给代理工厂合约
        console.log("\n=== 授权NFT ===");
        console.log("授权给地址:", proxyAddress);
        console.log("卖家地址:", seller.address);

        //卖家授权NFT tokenId给拍卖工厂代理
        const approveTx = await testNFT.connect(seller).approve(proxyAddress, tokenId);
        const approveReceipt = await approveTx.wait();
        console.log("授权交易已发送，哈希:", approveTx.hash);
        console.log("授权交易已确认，区块号:", approveReceipt.blockNumber);
        console.log("授权交易状态:", approveReceipt.status);

        // 验证授权
        const approvedAddr = await testNFT.getApproved(tokenId);
        console.log("已授权地址:", approvedAddr);
        //断言是否授权给拍卖工厂代理合约
        expect(approvedAddr.toLowerCase()).to.equal(proxyAddress.toLowerCase());


        console.log("\n=== 创建拍卖 ===");
        const createAuctionTx = await nftAuctionFactoryProxy.connect(seller).createAuction(
            testNFTAddress,
            tokenId,
            60,
            ethers.parseEther("0.000001"), // 起拍价 0.000001 ETH
            ethers.ZeroAddress  // 使用 ETH 作为支付代币
        );


        // 从交易收据中获取 AuctionContractCreated 事件参数
        const [auctionId, auctionContractProxyAddress, sellerAddress, nftContractAddress, tokenIdFromEvent, duration, startPrice, createAuctionPayToken] =
            await getEventFromReceipt(nftAuctionFactoryProxy, createAuctionTx, "AuctionContractCreated");

        console.log("\n=== AuctionContractCreated 事件参数 ===");
        console.log("拍卖ID (auctionId):", auctionId.toString());
        console.log("拍卖代理合约地址 (auctionContract):", auctionContractProxyAddress);
        console.log("卖家地址 (seller):", sellerAddress);
        console.log("NFT合约地址 (nftContract):", nftContractAddress);
        console.log("NFT ID (tokenId):", tokenIdFromEvent.toString());
        console.log("拍卖时长 (duration):", duration.toString(), "秒");
        if (createAuctionPayToken === ethers.ZeroAddress) {
            console.log("起拍价格 (startPrice):", ethers.formatEther(startPrice) + " ETH");
        } else {
            console.log("起拍价格 (startPrice):", ethers.formatUnits(startPrice, 6) + " USDC");
        }
        //断言NFT已经转移给了拍卖合约代理
        expect(await testNFT.ownerOf(tokenId)).to.equal(auctionContractProxyAddress);


        // 获取拍卖合约实例
        const NFTAuctionFactory = await ethers.getContractFactory("NFTAuction");
        const auctionContractProxy = NFTAuctionFactory.attach(auctionContractProxyAddress);

        //使用owner给auctionContractProxyAddress 转账0.000002 ETH用作手续费
        const transferTx = await owner.sendTransaction({
            to: auctionContractProxyAddress,
            value: ethers.parseEther("0.000002")
        });
        //等待转账成功
        await transferTx.wait();
        console.log("✅ 所有者给拍卖代理合约转账手续费成功！");



        // 买家1使用ETH竞价
        console.log("\n=== 买家1使用ETH竞价 ===");
        console.log("买家1地址:", buyer1.address);
        // 检查买家1的ETH余额
        const buyer1EthBalanceBefore = await ethers.provider.getBalance(buyer1.address);
        console.log("买家1拍卖前ETH余额:", ethers.formatEther(buyer1EthBalanceBefore));
        //断言大于0.000003 ETH 竞拍需要000002 还需要gas消耗
        expect(buyer1EthBalanceBefore).to.be.greaterThan(ethers.parseEther("0.000003"));

        let buyer1PlaceBidTx = null;
        // 买家1出价0.2 ETH
        try {
            buyer1PlaceBidTx = await auctionContractProxy.connect(buyer1).placeBid(
                ethers.ZeroAddress,
                ethers.parseEther("0.02"),
                { value: ethers.parseEther("0.02") }
            );

        } catch (error: any) {
            let errorData = error.data;
            console.error("错误数据:", errorData);
            const parsedError = auctionContractProxy.interface.parseError(errorData);
            console.error("出价因其他错误失败:", parsedError);
            //判断错误是否为 BidAmountNeedGtHighestBid()
            const BID_TOO_LOW_SELECTOR = ethers.id("BidAmountNeedGtHighestBid()").slice(0, 10);
            if (errorData && errorData.startsWith(BID_TOO_LOW_SELECTOR)) {
                console.log("买家1出价比初始价格低!");
                // 不 throw，继续往下走
            } else {
                throw error;
            }
        } finally {
            if (buyer1PlaceBidTx != null) {
                // 等待交易完成
                await buyer1PlaceBidTx.wait();
            }
        }

        console.log("买家1出价成功: 0.2 ETH");
        const buyer1EthBalanceAfter = await ethers.provider.getBalance(buyer1.address);
        console.log("买家1拍卖后ETH余额:", ethers.formatEther(buyer1EthBalanceAfter));

        //获取auctionContractProxy现在的最高出价者和最高出价
        let [, , , , , highestBidder, highestBid, , , payToken, ,] = await auctionContractProxy.auctionInfo();
        console.log("当前最高出价者:", highestBidder);
        if (payToken.toString() === ethers.ZeroAddress) {
            console.log("当前最高出价:", ethers.formatEther(highestBid), "ETH");
        } else {
            console.log("当前最高出价:", ethers.formatUnits(highestBid, 6), "USDC");
        }


        // 买家2使用USDC竞价
        console.log("\n=== 买家2使用USDC竞价 ===");
        console.log("买家2地址:", buyer2.address);

        const buyer2UsdcBalanceBefore = await usdc.balanceOf(buyer2.address);
        console.log("买家2拍卖前USDC余额:", ethers.formatUnits(buyer2UsdcBalanceBefore, 6), "USDC");
        const usdcCount = "0.5";
        const usdcBidAmount2 = ethers.parseUnits(usdcCount, 6);
        if (buyer2UsdcBalanceBefore < usdcBidAmount2) {
            const usdcTransferTx = await usdc.transfer(buyer2.address, usdcBidAmount2);
            await usdcTransferTx.wait();
            console.log("owner已向买家2转账" + usdcCount + " USDC");
        }

        // 买家2授权USDC给拍卖合约
        const usdcApproveTx = await (usdc as any).connect(buyer2).approve(auctionContractProxyAddress, usdcBidAmount2);
        // 等待授权完成
        await await usdcApproveTx.wait();
        console.log("买家2授权" + usdcCount + " USDC给拍卖代理合约");
        let buyer2PlaceBidTx = null;
        try {
            buyer2PlaceBidTx = await auctionContractProxy.connect(buyer2).placeBid(SEPOLIA_USDC_ADDRESS, usdcBidAmount2);
        } catch (error: any) {
            //判断错误是否为 BidAmountNeedGtHighestBid()
            const BID_TOO_LOW_SELECTOR = ethers.id("BidAmountNeedGtHighestBid()").slice(0, 10);
            let errorData = error.data;
            if (errorData && errorData.startsWith(BID_TOO_LOW_SELECTOR)) {
                console.log("买家2出价比最高价格低");
                // 不 throw，继续往下走
            } else {
                console.error("错误数据:", errorData);
                const parsedError = auctionContractProxy.interface.parseError(errorData);
                console.error("买家2出价因其他错误失败:", parsedError);
                throw error;
            }
        } finally {
            if (buyer2PlaceBidTx != null) {
                // 等待交易完成
                await buyer2PlaceBidTx.wait();
            }
        }
        console.log("买家2出价成功: 2 USDC");

        //获取auctionContractProxy现在的最高出价者和最高出价
        [, , , , , highestBidder, highestBid, , , payToken, ,] = await auctionContractProxy.auctionInfo();
        console.log("当前最高出价者:", highestBidder);
        if (payToken.toString() === ethers.ZeroAddress) {
            console.log("当前最高出价:", ethers.formatEther(highestBid), "ETH");
        } else {
            console.log("当前最高出价:", ethers.formatUnits(highestBid, 6), "USDC");
        }

        //判断最高出价者是买家1还是买家2
        if (highestBidder === buyer1.address) {
            console.log("最高出价者是买家1", buyer1.address);
        } else if (highestBidder === buyer2.address) {
            console.log("最高出价者是买家2", buyer2.address);
        }

        // 记录卖家拍卖结束前eth余额
        const sellerEthBalanceBefore = await ethers.provider.getBalance(seller.address);
        // 记录卖家拍卖结束前usdc余额
        const sellerUsdcBalanceBefore = await usdc.balanceOf(seller.address);
        // 记录平台拍卖结束前eth余额
        const platformEthBalanceBefore = await ethers.provider.getBalance(platform.address);
        // 记录平台拍卖结束前usdc余额
        const platformUsdcBalanceBefore = await usdc.balanceOf(platform.address);

        console.log("\n=== 拍卖结束前余额 ===");
        console.log("卖家ETH余额:", ethers.formatEther(sellerEthBalanceBefore), "ETH");
        console.log("卖家USDC余额:", ethers.formatUnits(sellerUsdcBalanceBefore, 6), "USDC");
        console.log("平台ETH余额:", ethers.formatEther(platformEthBalanceBefore), "ETH");
        console.log("平台USDC余额:", ethers.formatUnits(platformUsdcBalanceBefore, 6), "USDC");

        //等待70秒调用结束拍卖
        await new Promise(resolve => setTimeout(resolve, 70 * 1000));

        // 判断支付代币类型
        const isETH = payToken.toString() === ethers.ZeroAddress;
        const payTokenSymbol = isETH ? "ETH" : "USDC";
        console.log(`\n支付代币: ${payTokenSymbol}`);


        // 结束拍卖
        console.log("\n=== 结束拍卖 ===");
        let endAuctionTx = null;
        try {
            endAuctionTx = await auctionContractProxy.connect(seller).endAuction({
                gasLimit: 500000
            });

            console.log("✅ 拍卖结束成功！");
        } catch (error: any) {
            let errorData = error.data;
            console.error("错误数据:", errorData);
            const parsedError = auctionContractProxy.interface.parseError(errorData);
            console.error("出价因其他错误失败:", parsedError);
            throw error;
        } finally {
            if (endAuctionTx != null) {
                await endAuctionTx.wait();
            }
        }
        console.log("拍卖结束成功！");

        // 验证NFT已转移给最高出价者
        const nftOwnerAfter = await testNFT.ownerOf(tokenId);
        console.log("\n=== 拍卖结束后 ===");
        console.log("NFT新所有者:", nftOwnerAfter);
        expect(nftOwnerAfter).to.equal(highestBidder);

        // 记录结束拍卖后的余额
        const sellerEthBalanceAfter = await ethers.provider.getBalance(seller.address);
        const sellerUsdcBalanceAfter = await usdc.balanceOf(seller.address);
        const platformEthBalanceAfter = await ethers.provider.getBalance(platform.address);
        const platformUsdcBalanceAfter = await usdc.balanceOf(platform.address);

        console.log("\n=== 结束拍卖后余额 ===");
        console.log("卖家ETH余额:", ethers.formatEther(sellerEthBalanceAfter), "ETH");
        console.log("卖家USDC余额:", ethers.formatUnits(sellerUsdcBalanceAfter, 6), "USDC");
        console.log("平台ETH余额:", ethers.formatEther(platformEthBalanceAfter), "ETH");
        console.log("平台USDC余额:", ethers.formatUnits(platformUsdcBalanceAfter, 6), "USDC");

        // 假设手续费是2%，平台应该获得2%
        const platformFee = (highestBid * BigInt(200)) / BigInt(10000); // 2%
        const sellerProceeds = highestBid - platformFee;

        console.log("\n=== 资金分配验证 ===");
        if (isETH) {
            console.log("最高出价:", ethers.formatEther(highestBid), "ETH");
            console.log("平台手续费 (2%):", ethers.formatEther(platformFee), "ETH");
            console.log("卖家应得:", ethers.formatEther(sellerProceeds), "ETH");

            // 验证平台收到了ETH手续费
            const platformEthIncrease = platformEthBalanceAfter - platformEthBalanceBefore;
            console.log("平台ETH增加:", ethers.formatEther(platformEthIncrease), "ETH");
            expect(platformEthIncrease).to.be.closeTo(platformFee, ethers.parseEther("0.001"));

            // 验证卖家收到了ETH拍卖款项
            const sellerEthIncrease = sellerEthBalanceAfter - sellerEthBalanceBefore;
            console.log("卖家ETH增加:", ethers.formatEther(sellerEthIncrease), "ETH");
            expect(sellerEthIncrease).to.be.closeTo(sellerProceeds, ethers.parseEther("0.001"));
        } else {
            console.log("最高出价:", ethers.formatUnits(highestBid, 6), "USDC");
            console.log("平台手续费 (2%):", ethers.formatUnits(platformFee, 6), "USDC");
            console.log("卖家应得:", ethers.formatUnits(sellerProceeds, 6), "USDC");

            // 验证平台收到了USDC手续费
            const platformUsdcIncrease = platformUsdcBalanceAfter - platformUsdcBalanceBefore;
            console.log("平台USDC增加:", ethers.formatUnits(platformUsdcIncrease, 6), "USDC");
            expect(platformUsdcIncrease).to.be.closeTo(platformFee, ethers.parseUnits("0.001", 6));

            // 验证卖家收到了USDC拍卖款项
            const sellerUsdcIncrease = sellerUsdcBalanceAfter - sellerUsdcBalanceBefore;
            console.log("卖家USDC增加:", ethers.formatUnits(sellerUsdcIncrease, 6), "USDC");
            expect(sellerUsdcIncrease).to.be.closeTo(sellerProceeds, ethers.parseUnits("0.001", 6));
        }

        console.log("\n=== 拍卖结束测试完成 ===");
        console.log("✓ NFT已正确转移给最高出价者");
        console.log(`✓ 平台手续费已正确分配 (${payTokenSymbol})`);
        console.log(`✓ 卖家已收到拍卖款项 (${payTokenSymbol})`);

    });

});
