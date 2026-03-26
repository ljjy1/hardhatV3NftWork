import { buildModule } from "@nomicfoundation/hardhat-ignition/modules";

import NFTAuctionLocalModule from "./NFTAuctionModuleLocal.js";

export default buildModule("NFTAuctionFactoryLocalProxyModule", (m) => {

    const proxyAdminOwner = m.getAccount(0);

    //平台收取手续费的地址
    const feeReceiver = m.getParameter("feeReceiver");
    //拍卖收取的手续费比例 万分之单位 100 = 100/10000 1%  必须在 0.01% - 10% 之间
    const feeRatio = m.getParameter("feeRatio");

    const { nftAuctionLocal } = m.useModule(NFTAuctionLocalModule);

    //部署工厂逻辑合约
    const nftAuctionFactoryLocal = m.contract("NFTAuctionFactoryLocal", [])

    //代理部署
    const encodedFunctionCall = m.encodeFunctionCall(
        nftAuctionFactoryLocal, "initialize",
        [
            feeReceiver, // _feeReceiver平台手续费收款地址
            feeRatio,   //百分之2手续费
            nftAuctionLocal,   //NFT拍卖合约地址
        ]
    );

    const nftAuctionFactoryProxy = m.contract("TransparentUpgradeableProxy", [
        nftAuctionFactoryLocal,
        proxyAdminOwner,
        encodedFunctionCall,
    ]);

    const proxyAdminAddress = m.readEventArgument(
        nftAuctionFactoryProxy,
        "AdminChanged",
        "newAdmin",
    );

    const proxyAdmin = m.contractAt("ProxyAdmin", proxyAdminAddress);

    return { proxyAdmin, nftAuctionFactoryProxy};


});