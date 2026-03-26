import { buildModule } from "@nomicfoundation/hardhat-ignition/modules";

export default buildModule("NFTAuctionLocalModule", (m) => {
    const nftAuctionLocal = m.contract("NFTAuctionLocal", []);
    return { nftAuctionLocal };
});