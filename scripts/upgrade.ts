import hre from "hardhat";
import UpgradeNFTAuctionFactoryLocalProxyModule from "../ignition/modules/UpgradeNFTAuctionFactoryLocalProxyModule.js";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

async function main() {
    console.log("开始升级合约...\n");

    const { ethers, ignition } = await hre.network.connect();
    const [owner] = await ethers.getSigners();

    // 获取当前文件的目录路径
    const __filename = fileURLToPath(import.meta.url);
    const __dirname = path.dirname(__filename);

    // 从缓存文件读取合约地址
    const cacheFile = path.join(__dirname, ".cache", "deployment-cache.json");
    if (!fs.existsSync(cacheFile)) {
        console.error("缓存文件不存在，请先运行部署脚本");
        console.error("用法: npm run deploy:local 或者 npm run deploy:sepolia");
        process.exit(1);
    }

    const cacheData = JSON.parse(fs.readFileSync(cacheFile, "utf8"));
    const nftAuctionFactoryProxyAddress = cacheData.nftAuctionFactoryProxyAddress;
    const proxyAdminAddress = cacheData.proxyAdminAddress;

    if (!nftAuctionFactoryProxyAddress || !proxyAdminAddress) {
        console.error("缓存文件中缺少合约地址");
        process.exit(1);
    }

    console.log("升级 NFTAuctionFactoryLocalProxy 合约...");
    console.log("目标代理合约地址:", nftAuctionFactoryProxyAddress);
    console.log("ProxyAdmin 合约地址:", proxyAdminAddress);
    console.log("部署时间:", cacheData.deployedAt);
    console.log("");

    const { proxyAdmin, nftAuctionFactoryProxy } = await ignition.deploy(
        UpgradeNFTAuctionFactoryLocalProxyModule,
        {
            parameters: {
                UpgradeNFTAuctionFactoryLocalProxyModule: {
                    nftAuctionFactoryProxyAddress,
                    proxyAdminAddress
                }
            }
        }
    );

    console.log("ProxyAdmin 合约地址:", proxyAdmin.target);
    console.log("NFTAuctionFactoryProxy 合约地址:", nftAuctionFactoryProxy.target);
    console.log("");

    console.log("合约升级完成！");


    const tx = await nftAuctionFactoryProxy.addWhite(owner.getAddress);
    await tx.wait();

    console.log("白名单添加成功！交易哈希:", tx.hash);

    //调用获取手续费接口 验证升级成功
    const fee = await nftAuctionFactoryProxy.addWhite(100, owner.getAddress);
    console.log("获取手续费:", fee);
}

main().catch(console.error);
