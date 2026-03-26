import { buildModule } from "@nomicfoundation/hardhat-ignition/modules";

export default buildModule("TestNFTModule", (m) => {
    const testNFT = m.contract("TestNFT", []);
    return { testNFT};
});