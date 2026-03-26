import { expect } from "chai";
import { describe } from "mocha";

import hre from "hardhat";
const { ethers, networkHelpers } = await hre.network.connect();


describe("USDC", function () {
    it("测试合约铸币转账", async function () {
        const [owner, account2] = await ethers.getSigners();
        // 部署实现合约
        const USDCImplementationFactory = await ethers.getContractFactory("USDC");
        //工厂部署合约
        const USDCImplementation = await USDCImplementationFactory.deploy();

        //等待部署完成
        const USDCContract = await USDCImplementation.waitForDeployment();
        //获取合约地址
        const USDCAddress = await USDCContract.getAddress();
        const usdc = await ethers.getContractAt("USDC", USDCAddress);
        console.log("USDCAddress:", USDCAddress);

        // USDC精度为6位小数
        const decimals = await usdc.decimals();
        console.log("USDC decimals:", decimals);

        //检查初始余额
        const initialBalance = await usdc.balanceOf(owner.address);
        console.log("初始余额:", ethers.formatUnits(initialBalance, decimals));

        //给owner铸币100 USDC (需要乘以10^6)
        const mintAmount = ethers.parseUnits("100", decimals);
        await usdc.mint(owner.address, mintAmount);
        //检查owner余额
        const ownerBalance = await usdc.balanceOf(owner.address);
        console.log("铸币后余额:", ethers.formatUnits(ownerBalance, decimals));
        expect(ownerBalance).to.be.equal(initialBalance + mintAmount);

        //转账给账户2 50 USDC (需要乘以10^6)
        const transferAmount = ethers.parseUnits("50", decimals);
        await usdc.transfer(account2.address, transferAmount);
        //检查账户2余额
        const account2Balance = await usdc.balanceOf(account2.address);
        console.log("账户2余额:", ethers.formatUnits(account2Balance, decimals));
        expect(account2Balance).to.be.equal(transferAmount);
        //检查owner余额
        const ownerBalanceAfterTransfer = await usdc.balanceOf(owner.address);
        console.log("转账后owner余额:", ethers.formatUnits(ownerBalanceAfterTransfer, decimals));
        expect(ownerBalanceAfterTransfer).to.be.equal(initialBalance + mintAmount - transferAmount);

        //测试burn函数
        const burnAmount = ethers.parseUnits("10", decimals);
        await usdc.burn(owner.address, burnAmount);
        const ownerBalanceAfterBurn = await usdc.balanceOf(owner.address);
        console.log("burn后owner余额:", ethers.formatUnits(ownerBalanceAfterBurn, decimals));
        expect(ownerBalanceAfterBurn).to.be.equal(ownerBalanceAfterTransfer - burnAmount);

    });
});