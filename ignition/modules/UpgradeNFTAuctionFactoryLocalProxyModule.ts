import { buildModule } from "@nomicfoundation/hardhat-ignition/modules";

export default buildModule("UpgradeNFTAuctionFactoryLocalProxyModule", (m) => {
    const proxyAdminOwner = m.getAccount(0);

    // 现有代理合约地址
    const nftAuctionFactoryProxyAddress = m.getParameter("nftAuctionFactoryProxyAddress");
    // 现有 ProxyAdmin 合约地址
    const proxyAdminAddress = m.getParameter("proxyAdminAddress");

    const proxyAdmin = m.contractAt("ProxyAdmin", proxyAdminAddress);
    const nftAuctionFactoryProxy = m.contractAt("NFTAuctionFactoryLocal", nftAuctionFactoryProxyAddress);

    const nftAuctionFactoryLocalV2 = m.contract("NFTAuctionFactoryLocalV2");

    // 对于透明代理，通过 ProxyAdmin 合约执行升级操作
    // 使用 upgradeAndCall 方法，但不传递初始化数据
    m.call(proxyAdmin, "upgradeAndCall", [nftAuctionFactoryProxyAddress, nftAuctionFactoryLocalV2, "0x"], {
        from: proxyAdminOwner,
    });

    return { proxyAdmin, nftAuctionFactoryProxy };
});