import { expect } from "chai";
import { describe } from "mocha";
import { anyValue } from "@nomicfoundation/hardhat-ethers-chai-matchers/withArgs";
import hre from "hardhat";
const { ethers, networkHelpers } = await hre.network.connect();

describe("NFTAuctionLocal", function () {


    /**
     * 定义夹具函数(需要配合loadFixture使用)   替换beforeEach(beforeEach执行会在每个it前面每次都重复执行一次)
     * 作用:
     * 第一次调用时，执行 部署合约、初始化状态，并缓存结果；后续调用时直接返回缓存，不再重复部署，大幅提升测试速度
     * 自动隔离测试环境：每个测试文件 / 测试套件（describe 块）中，loadFixture 会保证夹具的状态是 "干净的"—— 不同测试用例（it 块）使用的是独立的合约状态，互不干扰
     * 简化测试代码：测试用例只需调用 loadFixture(夹具函数)，就能直接获取部署好的合约实例，无需重复写部署逻辑
     */
    async function deployNFTAuctionLocalFixture() {
        const nftAuctionLocalFactory = await ethers.getContractFactory("NFTAuctionLocal");
        const nftAuctionLocal = await nftAuctionLocalFactory.deploy();
        await nftAuctionLocal.waitForDeployment();
        const nftAuctionLocalAddress = await nftAuctionLocal.getAddress();
        return { nftAuctionLocal, nftAuctionLocalAddress };
    }

    async function deployTestNFTFixture() {
        const testNFTFactory = await ethers.getContractFactory("TestNFT");
        const testNFT = await testNFTFactory.deploy();
        await testNFT.waitForDeployment();
        const testNFTAddress = await testNFT.getAddress();
        return { testNFT, testNFTAddress };
    }

    async function deployUSDCFixture() {
        const usdcFactory = await ethers.getContractFactory("USDC");
        const usdc = await usdcFactory.deploy();
        await usdc.waitForDeployment();
        const usdcAddress = await usdc.getAddress();
        return { usdc, usdcAddress };
    }

    async function deployNFTAuctionLocalWithInitializeFixture() {
        const { testNFT, testNFTAddress } = await networkHelpers.loadFixture(deployTestNFTFixture);
        const { usdc, usdcAddress } = await networkHelpers.loadFixture(deployUSDCFixture);
        const { nftAuctionLocal, nftAuctionLocalAddress } = await networkHelpers.loadFixture(deployNFTAuctionLocalFixture);

        const [seller] = await ethers.getSigners();
        const factoryAddress = ethers.Wallet.createRandom().address;

        // 铸造NFT给卖家
        const tokenURI = "https://ipfs.io/ipfs/QmeMndgj4espSyREWbnefEBV8JkE1HjmvYMPy3Zfpr92Kd";
        await testNFT.safeMint(seller.address, tokenURI);

        // 初始化拍卖合约
        await nftAuctionLocal.initialize(
            usdcAddress,
            seller.address,
            testNFTAddress,
            3600,
            ethers.parseEther("0.1"),
            1,
            ethers.ZeroAddress,
            factoryAddress,
            1
        );

        // 授权NFT给拍卖合约
        await testNFT.connect(seller).approve(nftAuctionLocalAddress, 1);
        // 转移NFT到拍卖合约
        await testNFT.connect(seller).transferFrom(seller.address, nftAuctionLocalAddress, 1);

        return { nftAuctionLocal, nftAuctionLocalAddress, testNFT, testNFTAddress, usdc, usdcAddress, seller, factoryAddress };
    }


    it("测试initialize函数错误参数", async function () {
        // 部署 TestNFT 合约，获得有效的NFT合约地址
        const { testNFTAddress } = await networkHelpers.loadFixture(deployTestNFTFixture);
        const { usdcAddress } = await networkHelpers.loadFixture(deployUSDCFixture);

        const validAddress = ethers.Wallet.createRandom().address;

        // 测试用例
        const testCases = [
            {
                desc: "零地址USDC",
                params: [
                    ethers.ZeroAddress, // _usdcAddress
                    validAddress,       // _seller
                    testNFTAddress,     // _nftContract (使用有效的NFT合约地址)
                    3600,               // _duration
                    100000,             // _startPrice
                    1,                  // _tokenId
                    ethers.ZeroAddress, // _payToken
                    validAddress,       // _factory
                    1                   // _auctionId
                ],
                error: "ParameterError"
            },
            {
                desc: "零地址卖家",
                params: [
                    validAddress,
                    ethers.ZeroAddress,
                    testNFTAddress,     // _nftContract (使用有效的NFT合约地址)
                    3600,
                    100000,
                    1,
                    ethers.ZeroAddress,
                    validAddress,
                    1
                ],
                error: "ParameterError"
            },
            {
                desc: "零nft合约地址",
                params: [
                    validAddress,
                    validAddress,
                    ethers.ZeroAddress, // _nftContract (测试零地址)
                    3600,
                    100000,
                    1,
                    ethers.ZeroAddress,
                    validAddress,
                    1
                ],
                error: "ParameterError"
            },
            {
                desc: "零拍卖时长",
                params: [
                    validAddress,
                    validAddress,
                    testNFTAddress,     // _nftContract (使用有效的NFT合约地址)
                    0,
                    100000,
                    1,
                    ethers.ZeroAddress,
                    validAddress,
                    1
                ],
                error: "ParameterError"
            },
            {
                desc: "零起始价格",
                params: [
                    validAddress,
                    validAddress,
                    testNFTAddress,     // _nftContract (使用有效的NFT合约地址)
                    3600,
                    0,
                    1,
                    ethers.ZeroAddress,
                    validAddress,
                    1
                ],
                error: "ParameterError"
            },
            {
                desc: "零tokenId",
                params: [
                    validAddress,
                    validAddress,
                    testNFTAddress,     // _nftContract (使用有效的NFT合约地址)
                    3600,
                    10000,
                    0,
                    ethers.ZeroAddress,
                    validAddress,
                    1
                ],
                error: "ParameterError"
            },
            {
                desc: "零工厂地址",
                params: [
                    validAddress,
                    validAddress,
                    testNFTAddress,     // _nftContract (使用有效的NFT合约地址)
                    3600,
                    10000,
                    1,
                    ethers.ZeroAddress,
                    ethers.ZeroAddress,
                    1
                ],
                error: "ParameterError"
            },
            {
                desc: "零拍卖ID",
                params: [
                    validAddress,
                    validAddress,
                    testNFTAddress,     // _nftContract (使用有效的NFT合约地址)
                    3600,
                    10000,
                    1,
                    ethers.ZeroAddress,
                    validAddress,
                    0
                ],
                error: "ParameterError"
            },
            {
                desc: "NFT合约地址不合规",
                params: [
                    validAddress,       // _usdcAddress
                    validAddress,       // _seller
                    ethers.Wallet.createRandom().address, // 随机地址，不是NFT合约
                    3600,               // _duration
                    10000,              // _startPrice
                    1,                  // _tokenId
                    ethers.ZeroAddress, // _payToken
                    validAddress,       // _factory
                    1                   // _auctionId
                ],
                error: "InvalidNFTContract"
            },
            {
                desc: "支付代币价格为0",
                params: [
                    usdcAddress,
                    validAddress,
                    testNFTAddress,
                    3600,
                    10000,
                    1,
                    validAddress, // 非ETH也非USDC的地址，价格为0
                    validAddress,
                    1
                ],
                error: "InvalidChainlinkPriceFeed"
            }
        ];

        // 执行测试，为每个测试用例部署新合约
        for (const tc of testCases) {
            const { nftAuctionLocal } = await networkHelpers.loadFixture(deployNFTAuctionLocalFixture);

            console.log(`测试用例: ${tc.desc}`);
            console.log(`参数: [${tc.params}`);

            // 进行断言
            console.log(`开始断言...`);
            if(tc.desc === "NFT合约地址不合规"){
                // @ts-ignore
                await expect(nftAuctionLocal.initialize(...tc.params))
                    .to.revert(ethers);
            }else{
                // @ts-ignore
                await expect(nftAuctionLocal.initialize(...tc.params))
                    .to.be.revertedWithCustomError(nftAuctionLocal, tc.error)
                    .withArgs(anyValue);
            }

            console.log(`断言成功！`);
            console.log("------------------------");
        }
    });

    it("测试initialize函数不能初始化二次", async function () {
        const { testNFT } = await networkHelpers.loadFixture(deployTestNFTFixture);
        const testNFTAddress = await testNFT.getAddress();
        console.log("testNFTAddress", testNFTAddress);

        const { nftAuctionLocal } = await networkHelpers.loadFixture(deployNFTAuctionLocalFixture);
        const nftAuctionLocalAddress = await nftAuctionLocal.getAddress();
        console.log("nftAuctionLocalAddress", nftAuctionLocalAddress)

        const validAddress = ethers.Wallet.createRandom().address;
        const validParams = [
            validAddress,       // _usdcAddress
            validAddress,       // _seller
            testNFTAddress, // _nftContract (有效 ERC721 合约地址)
            3600,               // _duration
            200000,             // _startPrice
            1,                  // _tokenId
            ethers.ZeroAddress, // _payToken
            validAddress,       // _factory
            1                   // _auctionId
        ];

        console.log("第一次初始化...");
        // @ts-ignore
        await nftAuctionLocal.initialize(...validParams);
        console.log("第一次初始化成功！");

        console.log("第二次初始化...");
        // @ts-ignore
        await expect(nftAuctionLocal.initialize(...validParams))
            .to.be.revertedWithCustomError(nftAuctionLocal, "InvalidInitialization");
        console.log("第二次初始化失败（预期）！");
    });

    it("测试AuctionCreated事件", async function () {
        const [defaultAccount] = await ethers.getSigners();

        const { testNFT } = await networkHelpers.loadFixture(deployTestNFTFixture);
        const testNFTAddress = await testNFT.getAddress();
        console.log("testNFTAddress", testNFTAddress);

        const { nftAuctionLocal } = await networkHelpers.loadFixture(deployNFTAuctionLocalFixture);
        const nftAuctionLocalAddress = await nftAuctionLocal.getAddress();
        console.log("nftAuctionLocalAddress", nftAuctionLocalAddress)

        const validAddress = ethers.Wallet.createRandom().address;
        const validParams = [
            validAddress,       // _usdcAddress
            validAddress,       // _seller
            testNFTAddress, // _nftContract (有效 ERC721 合约地址)
            3600,               // _duration
            100000,             // _startPrice
            1,                  // _tokenId
            ethers.ZeroAddress, // _payToken
            validAddress,       // _factory
            1                   // _auctionId
        ];

        console.log("断言emit开始--");
        // @ts-ignore
        await expect(nftAuctionLocal.initialize(...validParams))
            .to.emit(nftAuctionLocal, "AuctionCreated")
        console.log("断言emit结束--");

        const contractOwner = await nftAuctionLocal.owner();
        console.log("当前账户地址:", defaultAccount.address)
        console.log("合约所有者地址:", contractOwner)

        expect(contractOwner).to.equal(defaultAccount.address);
    });

    it("测试placeBid函数错误情况", async function () {
        const { nftAuctionLocal, testNFT, seller } = await networkHelpers.loadFixture(deployNFTAuctionLocalWithInitializeFixture);
        const [_, buyer1, buyer2] = await ethers.getSigners();

        // 测试1: 出价金额为0
        console.log("测试1: 出价金额为0");
        await expect(nftAuctionLocal.connect(buyer1).placeBid(ethers.ZeroAddress, 0))
            .to.be.revertedWithCustomError(nftAuctionLocal, "ParameterError")
            .withArgs("amount need > 0");
        console.log("断言成功！");

        // 测试2: 卖家自己出价
        console.log("测试2: 卖家自己出价");
        await expect(nftAuctionLocal.connect(seller).placeBid(ethers.ZeroAddress, ethers.parseEther("0.2"), { value: ethers.parseEther("0.2") }))
            .to.be.revertedWithCustomError(nftAuctionLocal, "SellerCannotBid");
        console.log("断言成功！");

        // 测试3: ETH金额不匹配
        console.log("测试3: ETH金额不匹配");
        await expect(nftAuctionLocal.connect(buyer1).placeBid(ethers.ZeroAddress, ethers.parseEther("0.2"), { value: ethers.parseEther("0.1") }))
            .to.be.revertedWithCustomError(nftAuctionLocal, "ETHAmountNotEqualToBidAmount");
        console.log("断言成功！");

        // 测试4: 同时使用ETH和ERC20
        console.log("测试4: 同时使用ETH和ERC20");
        const { usdcAddress } = await networkHelpers.loadFixture(deployUSDCFixture);
        await expect(nftAuctionLocal.connect(buyer1).placeBid(usdcAddress, ethers.parseUnits("100", 6), { value: ethers.parseEther("0.1") }))
            .to.be.revertedWithCustomError(nftAuctionLocal, "CannotBidWithETHAndERC20");
        console.log("断言成功！");

        // 测试5: 出价小于最高出价
        console.log("测试5: 出价小于最高出价");
        // 先设置一个最高出价
        await nftAuctionLocal.connect(buyer1).placeBid(ethers.ZeroAddress, ethers.parseEther("0.2"), { value: ethers.parseEther("0.2") });
        // 再出一个更低的价格
        await expect(nftAuctionLocal.connect(buyer2).placeBid(ethers.ZeroAddress, ethers.parseEther("0.1"), { value: ethers.parseEther("0.1") }))
            .to.be.revertedWithCustomError(nftAuctionLocal, "BidAmountNeedGtHighestBid");
        console.log("断言成功！");
    });

    it("测试endAuction函数错误情况", async function () {
        const { nftAuctionLocal } = await networkHelpers.loadFixture(deployNFTAuctionLocalWithInitializeFixture);

        // 测试1: 拍卖未结束时结束拍卖
        console.log("测试1: 拍卖未结束时结束拍卖");
        await expect(nftAuctionLocal.endAuction())
            .to.be.revertedWithCustomError(nftAuctionLocal, "AuctionNotEnded");
        console.log("断言成功！");

        // 测试2: 拍卖已结束后再次结束拍卖
        console.log("测试2: 拍卖已结束后再次结束拍卖");
        // 快进时间到拍卖结束
        await networkHelpers.time.increase(3601);
        // 结束拍卖
        await nftAuctionLocal.endAuction();
        // 再次尝试结束拍卖
        await expect(nftAuctionLocal.endAuction())
            .to.be.revertedWithCustomError(nftAuctionLocal, "AuctionAlreadyEnded");
        console.log("断言成功！");
    });

    it("测试无人出价时结束拍卖", async function () {
        const { nftAuctionLocal, testNFT, seller } = await networkHelpers.loadFixture(deployNFTAuctionLocalWithInitializeFixture);

        // 快进时间到拍卖结束
        await networkHelpers.time.increase(3601);

        // 结束拍卖
        await nftAuctionLocal.endAuction();

        // 验证NFT是否返回给卖家
        const nftOwner = await testNFT.ownerOf(1);
        expect(nftOwner).to.equal(seller.address);
        console.log("无人出价时，NFT成功返回给卖家！");
    });



})