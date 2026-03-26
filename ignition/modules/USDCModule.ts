import { buildModule } from "@nomicfoundation/hardhat-ignition/modules";

export default buildModule("USDCModule", (m) => {
    const usdc = m.contract("USDC", []);
    return { usdc};
});