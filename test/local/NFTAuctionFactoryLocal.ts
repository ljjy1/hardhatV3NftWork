import { expect } from "chai";
import { describe } from "mocha";
import { anyValue } from "@nomicfoundation/hardhat-ethers-chai-matchers/withArgs";
import hre from "hardhat";
const { ethers, networkHelpers } = await hre.network.connect();

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


/**
 * 部署工厂函数夹具函数
 */
async function deployNFTAuctionFactoryLocalFixture() {
    const NFTAuctionFactoryLocalFactory = await ethers.getContractFactory("NFTAuctionFactoryLocal");
    const nftAuctionFactoryLocal = await NFTAuctionFactoryLocalFactory.deploy();
    await nftAuctionFactoryLocal.waitForDeployment();
    const nftAuctionFactoryLocalAddress = await nftAuctionFactoryLocal.getAddress();
    return { nftAuctionFactoryLocal, nftAuctionFactoryLocalAddress, NFTAuctionFactoryLocalFactory };
}

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


describe("NFTAuctionFactoryLocal", function () {


    it("测试initialize函数错误参数", async function () {
        const { nftAuctionFactoryLocal } = await networkHelpers.loadFixture(deployNFTAuctionFactoryLocalFixture);
        const { nftAuctionLocal } = await networkHelpers.loadFixture(deployNFTAuctionLocalFixture);

        const nftAuctionLocalAddress = await nftAuctionLocal.getAddress();

        const validAddress = ethers.Wallet.createRandom().address;

        const testCases = [
            {
                desc: "零地址feeReceiver",
                params: [
                    ethers.ZeroAddress,
                    100,
                    nftAuctionLocalAddress
                ],
                error: "ParameterError"
            },
            {
                desc: "零feeRatio",
                params: [
                    validAddress,
                    0,
                    nftAuctionLocalAddress
                ],
                error: "ParameterError"
            },
            {
                desc: "feeRatio过大（超过10%）",
                params: [
                    validAddress,
                    1001,
                    nftAuctionLocalAddress
                ],
                error: "ParameterError"
            },
            {
                desc: "零地址auctionImplementation",
                params: [
                    validAddress,
                    100,
                    ethers.ZeroAddress
                ],
                error: "ParameterError"
            }
        ];

        for (const tc of testCases) {
            console.log(`测试用例: ${tc.desc}`);
            console.log(`参数: [${tc.params}]`);

            await expect(nftAuctionFactoryLocal.initialize(
                tc.params[0] as string,
                tc.params[1] as number,
                tc.params[2] as string
            ))
                .to.be.revertedWithCustomError(nftAuctionFactoryLocal, tc.error)
                .withArgs(anyValue);

            console.log(`断言成功！`);
            console.log("------------------------");
        }
    });

    it("测试initialize函数不能初始化二次", async function () {
        const { nftAuctionFactoryLocal } = await networkHelpers.loadFixture(deployNFTAuctionFactoryLocalFixture);
        const { nftAuctionLocal } = await networkHelpers.loadFixture(deployNFTAuctionLocalFixture);
        const nftAuctionLocalAddress = await nftAuctionLocal.getAddress();


        const validAddress = ethers.Wallet.createRandom().address;

        console.log("第一次初始化...");
        await nftAuctionFactoryLocal.initialize(validAddress, 100, nftAuctionLocalAddress);
        console.log("第一次初始化成功！");

        console.log("第二次初始化...");
        await expect(nftAuctionFactoryLocal.initialize(validAddress, 100, nftAuctionLocalAddress))
            .to.be.revertedWithCustomError(nftAuctionFactoryLocal, "InvalidInitialization");
        console.log("第二次初始化失败（预期）！");
    });

    it("测试AuctionFactoryCreated事件", async function () {
        const [defaultAccount] = await ethers.getSigners();
        const { nftAuctionFactoryLocal } = await networkHelpers.loadFixture(deployNFTAuctionFactoryLocalFixture);
        const { nftAuctionLocal } = await networkHelpers.loadFixture(deployNFTAuctionLocalFixture);
        const nftAuctionLocalAddress = await nftAuctionLocal.getAddress();


        const feeReceiver = ethers.Wallet.createRandom().address;
        const feeRatio = 100;

        console.log("断言emit开始--");
        await expect(nftAuctionFactoryLocal.initialize(feeReceiver, feeRatio, nftAuctionLocalAddress))
            .to.emit(nftAuctionFactoryLocal, "AuctionFactoryCreated")
            .withArgs(feeReceiver, feeRatio);
        console.log("断言emit结束--");

        const contractOwner = await nftAuctionFactoryLocal.owner();
        console.log("当前账户地址:", defaultAccount.address);
        console.log("合约所有者地址:", contractOwner);
        expect(contractOwner).to.equal(defaultAccount.address);
    });

    it("测试获取手续费", async function () {
        const [seller] = await ethers.getSigners()

        const { nftAuctionFactoryLocal } = await networkHelpers.loadFixture(deployNFTAuctionFactoryLocalFixture);
        const { nftAuctionLocal } = await networkHelpers.loadFixture(deployNFTAuctionLocalFixture);
        const nftAuctionLocalAddress = await nftAuctionLocal.getAddress();

        const feeReceiver = ethers.Wallet.createRandom().address;
        const feeRatio = 100;

        await nftAuctionFactoryLocal.initialize(feeReceiver, feeRatio, nftAuctionLocalAddress);

        const amount = ethers.parseEther("1.0");
        const fee = await nftAuctionFactoryLocal.getFee(amount,seller.getAddress());
        const expectedFee = amount * BigInt(feeRatio) / 10000n;

        console.log("拍卖金额:", ethers.formatEther(amount), "ETH");
        console.log("手续费比例:", feeRatio / 100, "%");
        console.log("计算的手续费:", ethers.formatEther(fee), "ETH");
        console.log("预期手续费:", ethers.formatEther(expectedFee), "ETH");

        expect(fee).to.equal(expectedFee);
    });

    it("测试获取手续费收款地址", async function () {
        const { nftAuctionFactoryLocal } = await networkHelpers.loadFixture(deployNFTAuctionFactoryLocalFixture);
        const { nftAuctionLocal } = await networkHelpers.loadFixture(deployNFTAuctionLocalFixture);
        const nftAuctionLocalAddress = await nftAuctionLocal.getAddress();


        const feeReceiver = ethers.Wallet.createRandom().address;
        const feeRatio = 100;

        await nftAuctionFactoryLocal.initialize(feeReceiver, feeRatio, nftAuctionLocalAddress);

        const retrievedFeeReceiver = await nftAuctionFactoryLocal.getFeeReceiver();
        console.log("设置的手续费收款地址:", feeReceiver);
        console.log("获取的手续费收款地址:", retrievedFeeReceiver);

        expect(retrievedFeeReceiver).to.equal(feeReceiver);
    });


    it("测试createAuction函数错误参数", async function () {
        const [seller] = await ethers.getSigners();
        const { nftAuctionFactoryLocal } = await networkHelpers.loadFixture(deployNFTAuctionFactoryLocalFixture);
        const { nftAuctionLocal } = await networkHelpers.loadFixture(deployNFTAuctionLocalFixture);
        const nftAuctionLocalAddress = await nftAuctionLocal.getAddress();
        const { testNFT } = await networkHelpers.loadFixture(deployTestNFTFixture);
        const testNFTAddress = await testNFT.getAddress();
        const { usdc } = await networkHelpers.loadFixture(deployUSDCFixture);
        const usdcAddress = await usdc.getAddress();

        // 初始化工厂合约
        await nftAuctionFactoryLocal.initialize(seller.address, 100, nftAuctionLocalAddress);

        // 铸造NFT
        const tokenURI = "https://ipfs.io/ipfs/QmeMndgj4espSyREWbnefEBV8JkE1HjmvYMPy3Zfpr92Kd";
        const mintTx = await testNFT.safeMint(seller.address, tokenURI);
        await mintTx.wait();
        const tokenId = 1;

        // 测试用例
        const testCases = [
            {
                desc: "零地址usdcAddress",
                params: [
                    ethers.ZeroAddress,
                    testNFTAddress,
                    tokenId,
                    3600,
                    ethers.parseEther("0.1"),
                    ethers.ZeroAddress
                ],
                error: "ParameterError"
            },
            {
                desc: "零地址nftContract",
                params: [
                    usdcAddress,
                    ethers.ZeroAddress,
                    tokenId,
                    3600,
                    ethers.parseEther("0.1"),
                    ethers.ZeroAddress
                ],
                error: "ParameterError"
            },
            {
                desc: "零tokenId",
                params: [
                    usdcAddress,
                    testNFTAddress,
                    0,
                    3600,
                    ethers.parseEther("0.1"),
                    ethers.ZeroAddress
                ],
                error: "ParameterError"
            },
            {
                desc: "零拍卖时长",
                params: [
                    usdcAddress,
                    testNFTAddress,
                    tokenId,
                    0,
                    ethers.parseEther("0.1"),
                    ethers.ZeroAddress
                ],
                error: "ParameterError"
            },
            {
                desc: "零起始价格",
                params: [
                    usdcAddress,
                    testNFTAddress,
                    tokenId,
                    3600,
                    0,
                    ethers.ZeroAddress
                ],
                error: "ParameterError"
            },
            {
                desc: "不正规的NFT合约地址",
                params: [
                    usdcAddress,
                    usdcAddress,
                    tokenId,
                    3600,
                    1n,
                    ethers.ZeroAddress
                ],
                error: "ParameterError"
            },
            {
                desc: "NFT不属于卖家",
                params: [
                    usdcAddress,
                    testNFTAddress,
                    tokenId,
                    3600,
                    ethers.parseEther("0.1"),
                    ethers.ZeroAddress
                ],
                error: "InvalidNFTOwner",
                // 这个测试需要确保NFT不属于调用者
                setup: async () => {
                    // 不授权，确保NFT不属于调用者（这里使用seller地址，但不授权，应该会失败）
                    // 实际上，这个测试可能需要使用另一个地址来调用
                    const [, otherAddress] = await ethers.getSigners();
                    return otherAddress;
                }
            }
        ];

        for (const tc of testCases) {
            console.log(`测试用例: ${tc.desc}`);
            console.log(`参数: [${tc.params}]`);

            let caller = seller;
            if (tc.setup) {
                caller = await tc.setup();
            }

            if(tc.desc === "不正规的NFT合约地址"){
                // @ts-ignore
                // 对于其他错误，使用revertedWithCustomError
                await expect(nftAuctionFactoryLocal.connect(caller).createAuction(
                    tc.params[0] as string,
                    tc.params[1] as string,
                    tc.params[2] as number,
                    tc.params[3] as number,
                    tc.params[4] as bigint,
                    tc.params[5] as string
                ))
                    .to.revert(ethers);
            }else{
                // 对于其他错误，使用revertedWithCustomError
                await expect(nftAuctionFactoryLocal.connect(caller).createAuction(
                    tc.params[0] as string,
                    tc.params[1] as string,
                    tc.params[2] as number,
                    tc.params[3] as number,
                    tc.params[4] as bigint,
                    tc.params[5] as string
                ))
                    .to.be.revertedWithCustomError(nftAuctionFactoryLocal, tc.error);
            }


            console.log(`断言成功！`);
            console.log("------------------------");
        }
    });

    it("测试createAuction成功创建拍卖", async function () {
        const [seller] = await ethers.getSigners();
        const { nftAuctionFactoryLocal } = await networkHelpers.loadFixture(deployNFTAuctionFactoryLocalFixture);
        const nftAuctionFactoryLocalAddress = await nftAuctionFactoryLocal.getAddress();
        const { nftAuctionLocal } = await networkHelpers.loadFixture(deployNFTAuctionLocalFixture);
        const nftAuctionLocalAddress = await nftAuctionLocal.getAddress();
        const { testNFT } = await networkHelpers.loadFixture(deployTestNFTFixture);
        const testNFTAddress = await testNFT.getAddress();
        const { usdc } = await networkHelpers.loadFixture(deployUSDCFixture);
        const usdcAddress = await usdc.getAddress();

        const tokenURI = "https://ipfs.io/ipfs/QmeMndgj4espSyREWbnefEBV8JkE1HjmvYMPy3Zfpr92Kd";

        // 执行实际的铸造交易
        const mintTx = await testNFT.safeMint(seller.address, tokenURI);
        // 从交易收据中获取 Minted 事件参数
        const [to, tokenId, uri] = await getEventFromReceipt(testNFT, mintTx, "Minted");
        console.log("铸造交易完成，实际tokenId:", tokenId.toString());

        await nftAuctionFactoryLocal.initialize(seller.address, 100, nftAuctionLocalAddress);

        const approveTx = await testNFT.connect(seller).approve(
            nftAuctionFactoryLocalAddress,
            tokenId
        );
        await approveTx.wait();
        console.log("授权成功！");


        const createAuctionTx = await nftAuctionFactoryLocal.createAuction(
            usdcAddress,
            testNFTAddress,
            tokenId,
            3600,
            ethers.parseEther("0.1"),
            ethers.ZeroAddress
        );
        const [auctionId, auctionContractProxyAddress, sellerAddress, nftContractAddress, tokenIdFromEvent, duration, startPrice, createAuctionPayToken] =
            await getEventFromReceipt(nftAuctionFactoryLocal, createAuctionTx, "AuctionContractCreated");
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

        await expect(createAuctionTx)
            .to.emit(nftAuctionFactoryLocal, "AuctionContractCreated")
            .withArgs(1, anyValue, seller.address, testNFTAddress, tokenId, 3600, ethers.parseEther("0.1"), ethers.ZeroAddress);


        console.log("创建拍卖成功！");

        const nftOwner = await testNFT.ownerOf(tokenId);
        console.log("NFT当前所有者:", nftOwner);
        expect(nftOwner).to.not.equal(seller.address);
    });

    it("测试完整拍卖流程 - ETH和USDC竞价", async function () {
        //owner-部署账户
        //seller-卖家
        //buyer1-买家1
        //buyer2-买家2
        //platform-平台手续费收款账户地址
        const [owner, seller, buyer1, buyer2, platform] = await ethers.getSigners();
        const { nftAuctionLocalAddress, NFTAuctionLocalFactory } = await networkHelpers.loadFixture(deployNFTAuctionLocalFixture);
        console.log("部署NftAuctionLocal逻辑合约完成...", nftAuctionLocalAddress);
        const { testNFT, testNFTAddress } = await networkHelpers.loadFixture(deployTestNFTFixture);
        console.log("部署TestNFT合约完成...", testNFTAddress);
        const { usdc, usdcAddress } = await networkHelpers.loadFixture(deployUSDCFixture);
        console.log("部署USDC合约完成...", usdcAddress);
        const {
            nftAuctionFactoryLocalAddress,
            NFTAuctionFactoryLocalFactory
        } = await networkHelpers.loadFixture(deployNFTAuctionFactoryLocalFixture);
        console.log("部署NFTAuctionFactoryLocalFactory逻辑合约完成...", nftAuctionFactoryLocalAddress);

        //设置拍卖工厂初始化数据
        const initData = NFTAuctionFactoryLocalFactory.interface.encodeFunctionData("initialize", [
            platform.address, // _feeReceiver平台手续费收款地址
            200,   //百分之2手续费
            nftAuctionLocalAddress   //NFT拍卖合约地址
        ]);

        const ERC1967Proxy = await ethers.getContractFactory("ERC1967Proxy");
        const proxy = await ERC1967Proxy.deploy(
            nftAuctionFactoryLocalAddress,
            initData
        );
        await proxy.waitForDeployment();
        const proxyAddress = await proxy.getAddress();
        console.log("NFTAuctionFactoryLocal代理合约地址:", proxyAddress);

        const nftAuctionFactoryLocalProxy = NFTAuctionFactoryLocalFactory.attach(proxyAddress);
        console.log("NFTAuctionFactoryLocal代理合约部署并初始化完成！");

        // 铸造NFT给卖家
        const tokenURI = "https://ipfs.io/ipfs/QmeMndgj4espSyREWbnefEBV8JkE1HjmvYMPy3Zfpr92Kd";


        // 执行实际的铸造交易
        const mintTx = await testNFT.safeMint(seller.address, tokenURI);
        const [to, tokenId, uri] = await getEventFromReceipt(testNFT, mintTx, "Minted");
        console.log("铸造交易完成，实际tokenId:", tokenId.toString());

        // 卖家授权NFT给代理工厂合约
        const  approveTx = await testNFT.connect(seller).approve(proxyAddress, tokenId);
        await approveTx.wait();
        console.log("授权成功！");

        // 卖家创建拍卖
        const createAuctionTx = await nftAuctionFactoryLocalProxy.connect(seller).createAuction(
            usdcAddress,
            testNFTAddress,
            tokenId,
            3600,
            ethers.parseEther("0.1"),
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

        await expect(createAuctionTx)
            .to.emit(nftAuctionFactoryLocalProxy, "AuctionContractCreated")
            .withArgs(1, anyValue, seller.address, testNFTAddress, tokenId, 3600, ethers.parseEther("0.1"), ethers.ZeroAddress);

        console.log("创建拍卖成功！");

        // 获取拍卖合约实例
        const auctionContract = NFTAuctionLocalFactory.attach(auctionContractProxyAddress);

        // 买家1使用ETH竞价
        console.log("\n=== 买家1使用ETH竞价 ===");
        console.log("\n=== 买家1地址 ===", buyer1.address);
        const buyer1EthBalanceBefore = await ethers.provider.getBalance(buyer1.address);
        console.log("买家1拍卖前ETH余额:", ethers.formatEther(buyer1EthBalanceBefore), "ETH");

        const ethBidAmount = ethers.parseEther("0.2"); // 0.2 ETH
        const tx = await auctionContract.connect(buyer1).placeBid(ethers.ZeroAddress, ethBidAmount, { value: ethBidAmount });
        //等待交易执行完成
        await tx.wait();
        console.log("买家1出价成功: 0.2 ETH");
        const buyer1EthBalanceAfter = await ethers.provider.getBalance(buyer1.address);
        console.log("买家1拍卖后ETH余额:", ethers.formatEther(buyer1EthBalanceAfter), "ETH");

        // 买家2获取1000 USDC
        console.log("\n=== 买家2获取USDC ===");
        const usdcAmount = ethers.parseUnits("1000", 6); // 1000 USDC
        const  usdcTransferTx  =  await usdc.transfer(buyer2.address, usdcAmount);
        await usdcTransferTx.wait();
        console.log("USDC合约owner转1000 USDC给买家2");

        // 买家2拍卖前USDC余额
        const buyer2UsdcBalanceBefore = await usdc.balanceOf(buyer2.address);
        console.log("买家2拍卖前USDC余额:", ethers.formatUnits(buyer2UsdcBalanceBefore, 6), "USDC");

        // 买家2授权USDC给拍卖合约
        const usdcBidAmount = ethers.parseUnits("400", 6); // 400 USDC
        await usdc.connect(buyer2).approve(auctionContractProxyAddress, usdcBidAmount);
        console.log("买家2授权400 USDC给拍卖合约");

        // 买家2使用USDC竞价
        console.log("\n=== 买家2使用USDC竞价 ===");
        console.log("\n=== 买家2地址 ===", buyer2.address);
        const placeBid2Tx = await auctionContract.connect(buyer2).placeBid(usdcAddress, usdcBidAmount);
        await placeBid2Tx.wait();
        console.log("买家2出价成功: 400 USDC");

        // 快进时间，使拍卖结束
        await ethers.provider.send("evm_increaseTime", [3601]);
        await ethers.provider.send("evm_mine");
        console.log("\n拍卖时间结束");

        // 记录拍卖结束前所有相关地址的余额
        const sellerEthBalanceBefore = await ethers.provider.getBalance(seller.address);
        const sellerUsdcBalanceBefore = await usdc.balanceOf(seller.address);
        const platformEthBalanceBefore = await ethers.provider.getBalance(platform.address);
        const platformUsdcBalanceBefore = await usdc.balanceOf(platform.address);
        const buyer1EthBalanceBeforeEnd = await ethers.provider.getBalance(buyer1.address);
        const buyer2UsdcBalanceBeforeEnd = await usdc.balanceOf(buyer2.address);

        console.log("\n=== 拍卖结束前余额 ===");
        console.log("卖家ETH余额:", ethers.formatEther(sellerEthBalanceBefore), "ETH");
        console.log("卖家USDC余额:", ethers.formatUnits(sellerUsdcBalanceBefore, 6), "USDC");
        console.log("平台ETH余额:", ethers.formatEther(platformEthBalanceBefore), "ETH");
        console.log("平台USDC余额:", ethers.formatUnits(platformUsdcBalanceBefore, 6), "USDC");
        console.log("买家1ETH余额:", ethers.formatEther(buyer1EthBalanceBeforeEnd), "ETH");
        console.log("买家2USDC余额:", ethers.formatUnits(buyer2UsdcBalanceBeforeEnd, 6), "USDC");


        // 买家2结束拍卖
        console.log("\n=== 买家2结束拍卖 ===");
        const endAuctionTx = await auctionContract.connect(buyer2).endAuction();
        const [winner, nftContractFromEvent, tokenIdFromAuctionEnded, amount, payTokenFromAuctionEnded] =
            await getEventFromReceipt(auctionContract, endAuctionTx, "AuctionEnded");
        console.log("拍卖结束成功");

        console.log("\n=== AuctionEnded 事件参数 ===");
        console.log("胜者地址 (winner):", winner);
        console.log("NFT合约地址 (nftContract):", nftContractFromEvent);
        console.log("NFT ID (tokenId):", tokenIdFromAuctionEnded.toString());
        console.log("成交价格 (amount):", payTokenFromAuctionEnded === ethers.ZeroAddress ? ethers.formatEther(amount) + " ETH" : ethers.formatUnits(amount, 6) + " USDC");
        console.log("支付代币 (payToken):", payTokenFromAuctionEnded === ethers.ZeroAddress ? "ETH" : payTokenFromAuctionEnded);

        // 验证NFT归属
        const nftOwner = await testNFT.ownerOf(tokenId);
        console.log("\n=== 拍卖结果 ===");
        console.log("NFT最终所有者:", nftOwner);
        console.log("买家2地址:", buyer2.address);
        expect(nftOwner).to.equal(buyer2.address);

        // 根据payToken判断支付方式并验证余额
        if (payTokenFromAuctionEnded === ethers.ZeroAddress) {
            console.log("\n=== 胜者使用ETH支付 ===");

            // 计算预期的手续费和卖家收入
            const expectedFee = (amount * 200n) / 10000n;
            const expectedSellerAmount = amount - expectedFee;

            console.log("成交价格:", ethers.formatEther(amount), "ETH");
            console.log("预期手续费(2%):", ethers.formatEther(expectedFee), "ETH");
            console.log("预期卖家收入:", ethers.formatEther(expectedSellerAmount), "ETH");

            // 验证卖家收到的ETH
            const sellerEthBalanceAfter = await ethers.provider.getBalance(seller.address);
            const sellerEthReceived = sellerEthBalanceAfter - sellerEthBalanceBefore;

            console.log("\n=== 卖家ETH收入验证 ===");
            console.log("卖家拍卖前ETH余额:", ethers.formatEther(sellerEthBalanceBefore), "ETH");
            console.log("卖家拍卖后ETH余额:", ethers.formatEther(sellerEthBalanceAfter), "ETH");
            console.log("卖家实际收到ETH:", ethers.formatEther(sellerEthReceived), "ETH");
            console.log("卖家预期收到ETH:", ethers.formatEther(expectedSellerAmount), "ETH");

            expect(sellerEthReceived).to.equal(expectedSellerAmount);

            // 验证平台手续费地址收到的ETH
            const platformEthBalanceAfter = await ethers.provider.getBalance(platform.address);
            const platformEthReceived = platformEthBalanceAfter - platformEthBalanceBefore;

            console.log("\n=== 平台手续费验证 ===");
            console.log("平台拍卖前ETH余额:", ethers.formatEther(platformEthBalanceBefore), "ETH");
            console.log("平台拍卖后ETH余额:", ethers.formatEther(platformEthBalanceAfter), "ETH");
            console.log("平台实际收到ETH:", ethers.formatEther(platformEthReceived), "ETH");
            console.log("平台预期收到ETH:", ethers.formatEther(expectedFee), "ETH");

            expect(platformEthReceived).to.equal(expectedFee);

            // 验证卖家和平台没有收到USDC
            const sellerUsdcBalanceAfter = await usdc.balanceOf(seller.address);
            const platformUsdcBalanceAfter = await usdc.balanceOf(platform.address);
            expect(sellerUsdcBalanceAfter).to.equal(sellerUsdcBalanceBefore);
            expect(platformUsdcBalanceAfter).to.equal(platformUsdcBalanceBefore);

            console.log("\n=== 支付方式验证 ===");
            console.log("拍卖胜者支付方式: ETH");
            console.log("卖家和平台都应收到ETH，没有收到USDC");

        } else {
            console.log("\n=== 胜者使用USDC支付 ===");

            // 计算预期的手续费和卖家收入
            const expectedFee = (amount * 200n) / 10000n;
            const expectedSellerAmount = amount - expectedFee;

            console.log("成交价格:", ethers.formatUnits(amount, 6), "USDC");
            console.log("预期手续费(2%):", ethers.formatUnits(expectedFee, 6), "USDC");
            console.log("预期卖家收入:", ethers.formatUnits(expectedSellerAmount, 6), "USDC");

            // 验证卖家收到的USDC
            const sellerUsdcBalanceAfter = await usdc.balanceOf(seller.address);
            const sellerUsdcReceived = sellerUsdcBalanceAfter - sellerUsdcBalanceBefore;

            console.log("\n=== 卖家USDC收入验证 ===");
            console.log("卖家拍卖前USDC余额:", ethers.formatUnits(sellerUsdcBalanceBefore, 6), "USDC");
            console.log("卖家拍卖后USDC余额:", ethers.formatUnits(sellerUsdcBalanceAfter, 6), "USDC");
            console.log("卖家实际收到USDC:", ethers.formatUnits(sellerUsdcReceived, 6), "USDC");
            console.log("卖家预期收到USDC:", ethers.formatUnits(expectedSellerAmount, 6), "USDC");

            expect(sellerUsdcReceived).to.equal(expectedSellerAmount);

            // 验证平台手续费地址收到的USDC
            const platformUsdcBalanceAfter = await usdc.balanceOf(platform.address);
            const platformUsdcReceived = platformUsdcBalanceAfter - platformUsdcBalanceBefore;

            console.log("\n=== 平台手续费验证 ===");
            console.log("平台拍卖前USDC余额:", ethers.formatUnits(platformUsdcBalanceBefore, 6), "USDC");
            console.log("平台拍卖后USDC余额:", ethers.formatUnits(platformUsdcBalanceAfter, 6), "USDC");
            console.log("平台实际收到USDC:", ethers.formatUnits(platformUsdcReceived, 6), "USDC");
            console.log("平台预期收到USDC:", ethers.formatUnits(expectedFee, 6), "USDC");

            expect(platformUsdcReceived).to.equal(expectedFee);

            // 验证卖家和平台没有收到ETH
            const sellerEthBalanceAfter = await ethers.provider.getBalance(seller.address);
            const platformEthBalanceAfter = await ethers.provider.getBalance(platform.address);
            expect(sellerEthBalanceAfter).to.equal(sellerEthBalanceBefore);
            expect(platformEthBalanceAfter).to.equal(platformEthBalanceBefore);

            console.log("\n=== 支付方式验证 ===");
            console.log("拍卖胜者支付方式: USDC");
            console.log("卖家和平台都应收到USDC，没有收到ETH");
        }

        // 打印余额变化
        const buyer1EthBalanceFinal = await ethers.provider.getBalance(buyer1.address);
        const buyer2UsdcBalanceAfter = await usdc.balanceOf(buyer2.address);

        console.log("\n=== 余额变化 ===");
        console.log("买家1拍卖前ETH余额:", ethers.formatEther(buyer1EthBalanceBefore), "ETH");
        console.log("买家1拍卖后最终ETH余额:", ethers.formatEther(buyer1EthBalanceFinal), "ETH");
        console.log("买家1最终ETH变化:", ethers.formatEther(buyer1EthBalanceBefore - buyer1EthBalanceFinal), "ETH");

        console.log("买家2拍卖前USDC余额:", ethers.formatUnits(buyer2UsdcBalanceBefore, 6), "USDC");
        console.log("买家2拍卖后USDC余额:", ethers.formatUnits(buyer2UsdcBalanceAfter, 6), "USDC");
        console.log("买家2USDC变化:", ethers.formatUnits(buyer2UsdcBalanceBefore - buyer2UsdcBalanceAfter, 6), "USDC");

        // 打印NFT信息
        const nftTokenURI = await testNFT.tokenURI(tokenId);
        console.log("\n=== NFT信息 ===");
        console.log("NFT tokenId:", tokenId.toString());
        console.log("NFT tokenURI:", nftTokenURI);
    });
});