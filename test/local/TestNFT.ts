import { expect } from "chai";
import { describe } from "mocha";
import hre from "hardhat";
const { ethers, networkHelpers } = await hre.network.connect();

describe("TestNFT", function () {

    /**
     * 夹具函数
     */
    async function deployTestNFTFixture() {
        const testNFTFactory = await ethers.getContractFactory("TestNFT");
        const testNFT = await testNFTFactory.deploy();
        await testNFT.waitForDeployment();
        const testNFTAddress = await testNFT.getAddress();
        return { testNFT, testNFTAddress };
    }

    it("测试铸造NFT", async function () {
        const [owner, account2] = await ethers.getSigners();

        const { testNFT } = await networkHelpers.loadFixture(deployTestNFTFixture);
        const testNFTAddress = await testNFT.getAddress();

        console.log("testNFTAddress:", testNFTAddress);

        // 测试铸造NFT
        const tokenURI = "https://ipfs.io/ipfs/QmeMndgj4espSyREWbnefEBV8JkE1HjmvYMPy3Zfpr92Kd";

        // 设置事件监听器，在铸造前监听Minted事件
        const emittedEvent = new Promise<any[]>((resolve) => {
            (testNFT as any).once("Minted", (...args: any[]) => {
                resolve(args);
            });
        });

        // 铸造NFT
        const tx = await testNFT.safeMint(owner.address, tokenURI);
        await tx.wait();

        // 获取事件参数
        const [to, tokenId, uri] = await emittedEvent;
        console.log("从Minted事件获取的信息:");
        console.log("  to:", to);
        console.log("  tokenId:", tokenId?.toString());
        console.log("  uri:", uri);

        // 获取NFT的元数据URI
        const retrievedURI = await testNFT.tokenURI(tokenId);
        console.log("获取的元数据URI:", retrievedURI);
        expect(retrievedURI).to.equal(tokenURI);

        // 验证NFT所有者
        const tokenOwner = await testNFT.ownerOf(tokenId);
        console.log("NFT所有者:", tokenOwner);
        expect(tokenOwner).to.equal(owner.address);

        // 验证NFT余额
        const balance = await testNFT.balanceOf(owner.address);
        console.log("NFT余额:", balance.toString());
        expect(balance).to.equal(1);

        // 将NFT转给account2（使用safeTransferFrom更安全）
        console.log("开始转账NFT给account2...");
        const transferTx = await testNFT.connect(owner)["safeTransferFrom(address,address,uint256)"](owner.address, account2.address, tokenId);
        await transferTx.wait();
        console.log("转账成功！");

        // 验证转账后owner的NFT余额
        const ownerBalanceAfterTransfer = await testNFT.balanceOf(owner.address);
        console.log("转账后owner的NFT余额:", ownerBalanceAfterTransfer.toString());
        expect(ownerBalanceAfterTransfer).to.equal(0);

        // 验证转账后account2的NFT余额
        const account2Balance = await testNFT.balanceOf(account2.address);
        console.log("account2的NFT余额:", account2Balance.toString());
        expect(account2Balance).to.equal(1);

        // 验证NFT的新所有者
        const newOwner = await testNFT.ownerOf(tokenId);
        console.log("NFT新所有者:", newOwner);
        expect(newOwner).to.equal(account2.address);
    });


});