import { expect } from "chai";
import { describe } from "mocha";
import hre from "hardhat";
import { upgrades } from "@openzeppelin/hardhat-upgrades";


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


describe("NFTAuctionFactoryLocalV2", function () {
    let upgradesApi: any;
    let ethers: any;
    let networkHelpers: any;

    before(async () => {
        const connection = await hre.network.connect();
        ethers = connection.ethers;
        networkHelpers = connection.networkHelpers;
        upgradesApi = await upgrades(hre, connection);
    });

    /**
     * 部署 NFTAuctionLocal 逻辑合约
     */
    async function deployNFTAuctionLocalFixture() {
        const NFTAuctionLocalFactory = await ethers.getContractFactory("NFTAuctionLocal");
        const nftAuctionLocal = await NFTAuctionLocalFactory.deploy();
        await nftAuctionLocal.waitForDeployment();
        const nftAuctionLocalAddress = await nftAuctionLocal.getAddress();
        return { nftAuctionLocal, nftAuctionLocalAddress, NFTAuctionLocalFactory };
    }

    /**
     * 部署 TestNFT 合约
     */
    async function deployTestNFTFixture() {
        const TestNFTFactory = await ethers.getContractFactory("TestNFT");
        const testNFT = await TestNFTFactory.deploy();
        await testNFT.waitForDeployment();
        const testNFTAddress = await testNFT.getAddress();
        return { testNFT, testNFTAddress, TestNFTFactory };
    }

    /**
     * 部署 USDC 合约
     */
    async function deployUSDCFixture() {
        const USDCFactory = await ethers.getContractFactory("USDC");
        const usdc = await USDCFactory.deploy();
        await usdc.waitForDeployment();
        const usdcAddress = await usdc.getAddress();
        return { usdc, usdcAddress };
    }


    it("简单测试升级合约", async function () {
        const [owner] = await ethers.getSigners();
        const NFTAuctionFactoryLocalFactory = await ethers.getContractFactory("NFTAuctionFactoryLocal");
        const NFTAuctionFactoryLocalFactoryV2 = await ethers.getContractFactory("NFTAuctionFactoryLocalV2");
        const { nftAuctionLocalAddress } = await networkHelpers.loadFixture(deployNFTAuctionLocalFixture);
        console.log(`部署部署拍卖逻辑合约: ${nftAuctionLocalAddress} 完成`);
        const initializeFee = 200n;
        const nftAuctionFactoryLocal = await upgradesApi.deployProxy(NFTAuctionFactoryLocalFactory, [
            owner.address, // _feeReceiver平台手续费收款地址
            initializeFee,   //百分之2手续费
            nftAuctionLocalAddress   //NFT拍卖合约地址
        ], {
            initializer: "initialize",
        });
        const nftAuctionFactoryLocalProxyAddress = await nftAuctionFactoryLocal.getAddress();
        console.log(`部署拍卖工厂代理合约: ${nftAuctionFactoryLocalProxyAddress} 完成`);

        let implementation = await upgradesApi.erc1967.getImplementationAddress(nftAuctionFactoryLocalProxyAddress);
        console.log("拍卖工厂逻辑合约地址:", implementation);

        await upgradesApi.upgradeProxy(nftAuctionFactoryLocalProxyAddress, NFTAuctionFactoryLocalFactoryV2);

        implementation = await upgradesApi.erc1967.getImplementationAddress(nftAuctionFactoryLocalProxyAddress);
        console.log("升级后拍卖工厂逻辑合约地址:", implementation);
    });


    it("测试升级前完整拍卖流程", async function () {
        //owner-部署账户
        //seller-卖家
        //buyer1-买家1
        //buyer2-买家2
        //platform-平台手续费收款账户地址
        const [owner, seller, buyer1, buyer2, platform] = await ethers.getSigners();
        //部署NFTAuctionLocal逻辑合约
        const {
            nftAuctionLocal,
            nftAuctionLocalAddress,
            NFTAuctionLocalFactory
        } = await networkHelpers.loadFixture(deployNFTAuctionLocalFixture);
        console.log(`部署拍卖逻辑合约: ${nftAuctionLocalAddress} 完成`);
        //部署测试NFT合约
        const { testNFT, testNFTAddress, TestNFTFactory } = await networkHelpers.loadFixture(deployTestNFTFixture);
        console.log(`部署测试NFT合约: ${testNFTAddress} 完成`);
        //部署USDC合约
        const { usdc, usdcAddress } = await networkHelpers.loadFixture(deployUSDCFixture);
        console.log(`部署USDC合约: ${usdcAddress} 完成`);

        const NFTAuctionFactoryLocalFactory = await ethers.getContractFactory("NFTAuctionFactoryLocal");

        const initializeFee = 200n;
        const nftAuctionFactoryLocal = await upgradesApi.deployProxy(NFTAuctionFactoryLocalFactory, [
            platform.address, // _feeReceiver平台手续费收款地址
            initializeFee,   //百分之2手续费
            nftAuctionLocalAddress   //NFT拍卖合约地址
        ], {
            initializer: "initialize",
        });
        const nftAuctionFactoryLocalProxyAddress = await nftAuctionFactoryLocal.getAddress();
        console.log(`部署拍卖工厂代理合约: ${nftAuctionFactoryLocalProxyAddress} 完成`);

        let implementation = await upgradesApi.erc1967.getImplementationAddress(nftAuctionFactoryLocalProxyAddress);
        console.log("拍卖工厂逻辑合约地址:", implementation);


        //获取代理合约实例
        const nftAuctionFactoryLocalProxy = await ethers.getContractAt("NFTAuctionFactoryLocal", nftAuctionFactoryLocalProxyAddress);
        console.log(`NFTAuctionFactoryLocal代理合约实例:${nftAuctionFactoryLocalProxyAddress} 完成`);

        const tokenURI = "https://ipfs.io/ipfs/QmeMndgj4espSyREWbnefEBV8JkE1HjmvYMPy3Zfpr92Kd";
        //铸造NFT给卖家
        const safeMintTx = await testNFT.safeMint(seller.address, tokenURI);
        //等待铸币完成并且获取事件
        const [to, tokenId, uri] = await getEventFromReceipt(testNFT, safeMintTx, "Minted");
        console.log(`NFT铸造成功，NFT地址: ${to}, tokenId: ${tokenId}, uri: ${uri}`);

        //授权NFT给NFTAuctionFactoryLocal代理合约
        const nftApproveTx = await testNFT.connect(seller).approve(nftAuctionFactoryLocalProxyAddress, tokenId);
        //等待授权完成
        await nftApproveTx.wait();
        console.log(`NFT授权成功，卖家: ${seller.address} 将NFT授权给: ${nftAuctionFactoryLocalProxyAddress}, tokenId: ${tokenId}`);

        //卖家创建拍卖
        const createAuctionTx = await nftAuctionFactoryLocalProxy.connect(seller).createAuction(
            usdcAddress,
            testNFTAddress,
            tokenId,
            3600,
            ethers.parseEther("1"), //1*10**18 WEI
            ethers.ZeroAddress
        );
        const [auctionId, auctionContractProxyAddress, sellerAddress, nftContractAddress, tokenIdFromEvent, duration, startPrice, createAuctionPayToken] =
            await getEventFromReceipt(nftAuctionFactoryLocalProxy, createAuctionTx, "AuctionContractCreated");
        // 获取事件参数
        console.log("\n=== AuctionContractCreated 事件参数 ===");
        console.log("拍卖ID (auctionId):", auctionId.toString());
        console.log("拍卖合约地址 (auctionContract):", auctionContractProxyAddress);
        console.log("卖家地址 (seller):", sellerAddress);
        console.log("NFT合约地址 (nftContract):", nftContractAddress);
        console.log("NFT ID (tokenId):", tokenIdFromEvent.toString());
        console.log("拍卖时长 (duration):", duration.toString(), "秒");
        console.log("起拍价格 (startPrice):", ethers.formatEther(startPrice), "ETH");
        console.log("支付代币 (payToken):", createAuctionPayToken === ethers.ZeroAddress ? "ETH" : "token");
        console.log("创建拍卖成功！");

        //获取拍卖合约代理实例
        const auctionContract = NFTAuctionLocalFactory.attach(auctionContractProxyAddress);

        //买家1出价前的eth余额
        const buyer1EthBalanceBefore = await ethers.provider.getBalance(buyer1.address);
        console.log(`买家1竞拍前的eth余额: ${ethers.formatEther(buyer1EthBalanceBefore)} ETH`);

        const buyer1PlaceBidAmount = ethers.parseEther("2");
        //买家1参与拍卖
        const buyer1PlaceBidTx = await auctionContract.connect(buyer1).placeBid(
            ethers.ZeroAddress,
            buyer1PlaceBidAmount,
            {
                value: buyer1PlaceBidAmount
            }
        );
        //等待竞拍完成
        await buyer1PlaceBidTx.wait();
        //买家出价后的eth余额
        const buyer1EthBalanceAfter = await ethers.provider.getBalance(buyer1.address);
        console.log(`买家1竞拍后的eth余额: ${ethers.formatEther(buyer1EthBalanceAfter)} ETH`);


        //买家2出价前的eth余额
        const buyer2EthBalanceBefore = await ethers.provider.getBalance(buyer2.address);
        console.log(`买家2竞拍前的eth余额: ${ethers.formatEther(buyer2EthBalanceBefore)} ETH`);
        const buyer2PlaceBidAmount = ethers.parseEther("3");
        //买家2参与拍卖
        const buyer2PlaceBidTx = await auctionContract.connect(buyer2).placeBid(
            ethers.ZeroAddress,
            buyer2PlaceBidAmount,
            {
                value: buyer2PlaceBidAmount
            }
        )
        //等待竞拍完成
        await buyer2PlaceBidTx.wait();
        //买家2出价后的eth余额
        const buyer2EthBalanceAfter = await ethers.provider.getBalance(buyer2.address);
        console.log(`买家2竞拍后的eth余额: ${ethers.formatEther(buyer2EthBalanceAfter)} ETH`);


        // 快进时间，使拍卖结束
        await ethers.provider.send("evm_increaseTime", [3601]);
        await ethers.provider.send("evm_mine");
        console.log("拍卖时间结束");


        //结束拍卖前记录卖家eth余额
        const sellerEthBalanceBefore = await ethers.provider.getBalance(seller.address);
        console.log(`卖家结束拍卖前的eth余额: ${ethers.formatEther(sellerEthBalanceBefore)} ETH`);
        //平台收款eth余额
        const platformEthBalanceBefore = await ethers.provider.getBalance(platform.address);
        console.log(`平台收款前的eth余额: ${ethers.formatEther(platformEthBalanceBefore)} ETH`);


        //结束拍卖
        const endAuctionTx = await auctionContract.connect(seller).endAuction();
        const [winner, nftContractFromEvent, tokenIdFromAuctionEnded, amount, payTokenFromAuctionEnded] =
            await getEventFromReceipt(auctionContract, endAuctionTx, "AuctionEnded");
        console.log("拍卖结束成功");
        console.log("\n=== AuctionEnded 事件参数 ===");
        console.log("胜者地址 (winner):", winner);
        console.log("NFT合约地址 (nftContract):", nftContractFromEvent);
        console.log("NFT ID (tokenId):", tokenIdFromAuctionEnded.toString());
        console.log("成交价格 (amount):", payTokenFromAuctionEnded === ethers.ZeroAddress ? ethers.formatEther(amount) + " ETH" : ethers.formatUnits(amount, 6) + " USDC");
        // 验证NFT归属
        const nftOwner = await testNFT.ownerOf(tokenId);
        console.log("\n=== 拍卖结果 ===");
        console.log("NFT最终所有者:", nftOwner);
        console.log("买家2地址:", buyer2.address);
        expect(nftOwner).to.equal(buyer2.address);

        //获取卖家拍卖后的eth余额
        const sellerEthBalanceAfter = await ethers.provider.getBalance(seller.address);
        console.log(`卖家结束拍卖后的eth余额: ${ethers.formatEther(sellerEthBalanceAfter)} ETH`);

        // 获取平台结束拍卖后的eth余额
        const platformEthBalanceAfter = await ethers.provider.getBalance(platform.address);
        console.log(`平台结束拍卖后的eth余额: ${ethers.formatEther(platformEthBalanceAfter)} ETH`);

    });

    it("测试升级后完整拍卖流程(升级后V2版本拍卖工厂)", async function () {
        //owner-部署账户
        //seller-卖家
        //buyer1-买家1
        //buyer2-买家2
        //platform-平台手续费收款账户地址
        const [owner, seller, buyer1, buyer2, platform] = await ethers.getSigners();
        //部署NFTAuctionLocal逻辑合约
        const {
            nftAuctionLocal,
            nftAuctionLocalAddress,
            NFTAuctionLocalFactory
        } = await networkHelpers.loadFixture(deployNFTAuctionLocalFixture);
        console.log(`部署拍卖逻辑合约: ${nftAuctionLocalAddress} 完成`);
        //部署测试NFT合约
        const { testNFT, testNFTAddress, TestNFTFactory } = await networkHelpers.loadFixture(deployTestNFTFixture);
        console.log(`部署测试NFT合约: ${testNFTAddress} 完成`);
        //部署USDC合约
        const { usdc, usdcAddress } = await networkHelpers.loadFixture(deployUSDCFixture);
        console.log(`部署USDC合约: ${usdcAddress} 完成`);

        const NFTAuctionFactoryLocalFactory = await ethers.getContractFactory("NFTAuctionFactoryLocal");

        const initializeFee = 200n;
        const nftAuctionFactoryLocal = await upgradesApi.deployProxy(NFTAuctionFactoryLocalFactory, [
            platform.address, // _feeReceiver平台手续费收款地址
            initializeFee,   //百分之2手续费
            nftAuctionLocalAddress   //NFT拍卖合约地址
        ], {
            initializer: "initialize",
        });
        const nftAuctionFactoryLocalProxyAddress = await nftAuctionFactoryLocal.getAddress();
        console.log(`部署拍卖工厂代理合约: ${nftAuctionFactoryLocalProxyAddress} 完成`);

        let implementation = await upgradesApi.erc1967.getImplementationAddress(nftAuctionFactoryLocalProxyAddress);
        console.log("拍卖工厂逻辑合约地址:", implementation);


        console.log("\n===  给拍卖工厂合约进行升级到NFTAuctionFactoryLocalV2 ===");
        console.log("\n=== 主要是添加白名单,白名单内地址创建的拍卖合约将不收取手续费 ===");

        const nftAuctionFactoryLocalFactoryV2Factory = await ethers.getContractFactory("NFTAuctionFactoryLocalV2");

        //使用合约原生方法升级合约的方式 nftAuctionFactoryLocalProxy.upgradeToAndCall 比较麻烦
        //使用hardhat-upgrades升级(内部其实也是使用了upgradeToAndCall)
        await upgradesApi.upgradeProxy(nftAuctionFactoryLocalProxyAddress, nftAuctionFactoryLocalFactoryV2Factory);
        console.log("合约升级成功");

        implementation = await upgradesApi.erc1967.getImplementationAddress(nftAuctionFactoryLocalProxyAddress);
        console.log("新的拍卖工厂逻辑合约地址:", implementation);


        //获取代理合约实例 - 使用V2版本接口以访问新函数
        const nftAuctionFactoryLocalProxy = nftAuctionFactoryLocalFactoryV2Factory.attach(nftAuctionFactoryLocalProxyAddress);
        console.log(`NFTAuctionFactoryLocalV2代理合约实例:${nftAuctionFactoryLocalProxyAddress} 完成`);

        //卖家添加白名单
        const addWhiteTx = await nftAuctionFactoryLocalProxy.addWhite(seller.address);
        await addWhiteTx.wait();
        console.log(`卖家: ${seller.address} 添加白名单成功`);



        const tokenURI = "https://ipfs.io/ipfs/QmeMndgj4espSyREWbnefEBV8JkE1HjmvYMPy3Zfpr92Kd";
        //铸造NFT给卖家
        const safeMintTx = await testNFT.safeMint(seller.address, tokenURI);
        //等待铸币完成并且获取事件
        const [to, tokenId, uri] = await getEventFromReceipt(testNFT, safeMintTx, "Minted");
        console.log(`NFT铸造成功，NFT地址: ${to}, tokenId: ${tokenId}, uri: ${uri}`);

        //授权NFT给NFTAuctionFactoryLocal代理合约
        const nftApproveTx = await testNFT.connect(seller).approve(nftAuctionFactoryLocalProxyAddress, tokenId);
        //等待授权完成
        await nftApproveTx.wait();
        console.log(`NFT授权成功，卖家: ${seller.address} 将NFT授权给: ${nftAuctionFactoryLocalProxyAddress}, tokenId: ${tokenId}`);

        //卖家创建拍卖
        const createAuctionTx = await nftAuctionFactoryLocalProxy.connect(seller).createAuction(
            usdcAddress,
            testNFTAddress,
            tokenId,
            3600,
            ethers.parseEther("1"), //1*10**18 WEI
            ethers.ZeroAddress
        );
        const [auctionId, auctionContractProxyAddress, sellerAddress, nftContractAddress, tokenIdFromEvent, duration, startPrice, createAuctionPayToken] =
            await getEventFromReceipt(nftAuctionFactoryLocalProxy, createAuctionTx, "AuctionContractCreated");
        // 获取事件参数
        console.log("\n=== AuctionContractCreated 事件参数 ===");
        console.log("拍卖ID (auctionId):", auctionId.toString());
        console.log("拍卖合约地址 (auctionContract):", auctionContractProxyAddress);
        console.log("卖家地址 (seller):", sellerAddress);
        console.log("NFT合约地址 (nftContract):", nftContractAddress);
        console.log("NFT ID (tokenId):", tokenIdFromEvent.toString());
        console.log("拍卖时长 (duration):", duration.toString(), "秒");
        console.log("起拍价格 (startPrice):", ethers.formatEther(startPrice), "ETH");
        console.log("支付代币 (payToken):", createAuctionPayToken === ethers.ZeroAddress ? "ETH" : "token");
        console.log("创建拍卖成功！");

        //获取拍卖合约代理实例
        const auctionContract = NFTAuctionLocalFactory.attach(auctionContractProxyAddress);

        //买家1出价前的eth余额
        const buyer1EthBalanceBefore = await ethers.provider.getBalance(buyer1.address);
        console.log(`买家1竞拍前的eth余额: ${ethers.formatEther(buyer1EthBalanceBefore)} ETH`);

        const buyer1PlaceBidAmount = ethers.parseEther("2");
        //买家1参与拍卖
        const buyer1PlaceBidTx = await auctionContract.connect(buyer1).placeBid(
            ethers.ZeroAddress,
            buyer1PlaceBidAmount,
            {
                value: buyer1PlaceBidAmount
            }
        );
        //等待竞拍完成
        await buyer1PlaceBidTx.wait();
        //买家出价后的eth余额
        const buyer1EthBalanceAfter = await ethers.provider.getBalance(buyer1.address);
        console.log(`买家1竞拍后的eth余额: ${ethers.formatEther(buyer1EthBalanceAfter)} ETH`);


        //买家2出价前的eth余额
        const buyer2EthBalanceBefore = await ethers.provider.getBalance(buyer2.address);
        console.log(`买家2竞拍前的eth余额: ${ethers.formatEther(buyer2EthBalanceBefore)} ETH`);
        const buyer2PlaceBidAmount = ethers.parseEther("3");
        //买家2参与拍卖
        const buyer2PlaceBidTx = await auctionContract.connect(buyer2).placeBid(
            ethers.ZeroAddress,
            buyer2PlaceBidAmount,
            {
                value: buyer2PlaceBidAmount
            }
        )
        //等待竞拍完成
        await buyer2PlaceBidTx.wait();
        //买家2出价后的eth余额
        const buyer2EthBalanceAfter = await ethers.provider.getBalance(buyer2.address);
        console.log(`买家2竞拍后的eth余额: ${ethers.formatEther(buyer2EthBalanceAfter)} ETH`);


        // 快进时间，使拍卖结束
        await ethers.provider.send("evm_increaseTime", [3601]);
        await ethers.provider.send("evm_mine");
        console.log("拍卖时间结束");


        //结束拍卖前记录卖家eth余额
        const sellerEthBalanceBefore = await ethers.provider.getBalance(seller.address);
        console.log(`卖家结束拍卖前的eth余额: ${ethers.formatEther(sellerEthBalanceBefore)} ETH`);
        //平台收款eth余额
        const platformEthBalanceBefore = await ethers.provider.getBalance(platform.address);
        console.log(`平台收款前的eth余额: ${ethers.formatEther(platformEthBalanceBefore)} ETH`);


        //结束拍卖
        const endAuctionTx = await auctionContract.connect(seller).endAuction();
        const [winner, nftContractFromEvent, tokenIdFromAuctionEnded, amount, payTokenFromAuctionEnded] =
            await getEventFromReceipt(auctionContract, endAuctionTx, "AuctionEnded");
        console.log("拍卖结束成功");
        console.log("\n=== AuctionEnded 事件参数 ===");
        console.log("胜者地址 (winner):", winner);
        console.log("NFT合约地址 (nftContract):", nftContractFromEvent);
        console.log("NFT ID (tokenId):", tokenIdFromAuctionEnded.toString());
        console.log("成交价格 (amount):", payTokenFromAuctionEnded === ethers.ZeroAddress ? ethers.formatEther(amount) + " ETH" : ethers.formatUnits(amount, 6) + " USDC");
        // 验证NFT归属
        const nftOwner = await testNFT.ownerOf(tokenId);
        console.log("\n=== 拍卖结果 ===");
        console.log("NFT最终所有者:", nftOwner);
        console.log("买家2地址:", buyer2.address);
        expect(nftOwner).to.equal(buyer2.address);

        //获取卖家拍卖后的eth余额
        const sellerEthBalanceAfter = await ethers.provider.getBalance(seller.address);
        console.log(`卖家结束拍卖后的eth余额: ${ethers.formatEther(sellerEthBalanceAfter)} ETH`);

        // 获取平台结束拍卖后的eth余额
        const platformEthBalanceAfter = await ethers.provider.getBalance(platform.address);
        console.log(`平台结束拍卖后的eth余额: ${ethers.formatEther(platformEthBalanceAfter)} ETH`);

    });
});