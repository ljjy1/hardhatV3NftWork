import hre from "hardhat";
import TestNFTModule from "../ignition/modules/TestNFTModule.js";
import USDCModule from "../ignition/modules/USDCModule.js";
import NFTAuctionFactoryLocalProxyModule from "../ignition/modules/NFTAuctionFactoryLocalProxyModule.js";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

async function main() {
    console.log("开始部署合约...\n");

    const { ethers, ignition } = await hre.network.connect();
    const [owner] = await ethers.getSigners();

    // 获取当前文件的目录路径
    const __filename = fileURLToPath(import.meta.url);
    const __dirname = path.dirname(__filename);

    console.log("部署 TestNFT 合约...");
    const { testNFT } = await ignition.deploy(TestNFTModule);
    console.log("TestNFT 合约地址:", testNFT.target);
    console.log("");

    console.log("部署 USDC 合约...");
    const { usdc } = await ignition.deploy(USDCModule);
    console.log("USDC 合约地址:", usdc.target);
    console.log("");

    console.log("部署 NFTAuctionFactoryLocalProxy 合约...");
    const deploymentResult = await ignition.deploy(
        NFTAuctionFactoryLocalProxyModule,
        {
            parameters: {
                NFTAuctionFactoryLocalProxyModule: {
                    feeReceiver: await owner.getAddress(),
                    feeRatio: 200
                }
            }
        }
    );
    const { proxyAdmin, nftAuctionFactoryProxy } = deploymentResult;
    console.log("ProxyAdmin 合约地址:", proxyAdmin.target);
    console.log("NFTAuctionFactoryProxy 合约地址:", nftAuctionFactoryProxy.target);
    console.log("");

    // 缓存合约地址到 .cache 文件夹
    const cacheDir = path.join(__dirname, ".cache");
    if (!fs.existsSync(cacheDir)) {
        fs.mkdirSync(cacheDir, { recursive: true });
    }

    const cacheData = {
        proxyAdminAddress: proxyAdmin.target,
        nftAuctionFactoryProxyAddress: nftAuctionFactoryProxy.target,
        deployedAt: new Date().toISOString()
    };

    const cacheFile = path.join(cacheDir, "deployment-cache.json");
    fs.writeFileSync(cacheFile, JSON.stringify(cacheData, null, 2));
    console.log(`合约地址已缓存到: ${cacheFile}`);
    console.log("");

    console.log("所有合约部署完成！");
}

main().catch(console.error);
