import "dotenv/config";
import hardhatToolboxMochaEthersPlugin from "@nomicfoundation/hardhat-toolbox-mocha-ethers";
import { defineConfig } from "hardhat/config";
import hardhatUpgrades from '@openzeppelin/hardhat-upgrades';

export default defineConfig({
  plugins: [hardhatToolboxMochaEthersPlugin,hardhatUpgrades],
  /**
   * Ignition 配置 也可以配置在特定网络下 如放在networks sepolia下面 这里是代表全局优先级最高
   * 文档地址 https://hardhat.org/ignition/docs/reference/config
   */
  // ignition: {
  //   //Hardhat Ignition 在两次检查新区块是否已铸造之间等待的时间（以毫秒为单位）默认1_000
  //   blockPollingInterval: 1_000,
  //   //未确认交易在提高手续费前等待的时间（以毫秒为单位）。 默认180_000
  //   timeBeforeBumpingFees: 180_000,
  //   //在 Hardhat Ignition 认为未确认的交易超时之前，该交易的手续费会被提高多少次。 默认4
  //   maxFeeBumps: 4,
  //   //Hardhat Ignition 在将交易视为完成之前等待的确认次数。这可以控制区块重组的风险。 默认5
  //   requiredConfirmations: 5,
  //   //如果设置为 true ，Hardhat Ignition 将不会对未确认的交易收取额外费用。此设置会覆盖网络配置中的 disableFeeBumping 选项。
  //   disableFeeBumping: false,
  //   //Hardhat Ignition 在因网络错误导致交易发送失败时将重试的次数。 默认10
  //   maxRetries: 10,
  //   //Hardhat Ignition 在因网络错误导致事务失败时，重试之间等待的时间（以毫秒为单位）。默认1_000
  //   retryInterval: 1_000,
  //   // 策略配置
  //   strategyConfig: {
  //     //使用create2 策略
  //     create2: {
  //       //创建2的盐 一个 32 字节的十六进制编码字符串 需要替换为你的盐
  //       salt: "0x0000000000000000000000000000000000000000000000000000000000000000",
  //     },
  //   },
  // },
  solidity: {
    profiles: {
      default: {
        version: "0.8.28",
      },
      production: {
        version: "0.8.28",
        settings: {
          optimizer: {
            enabled: true,
            runs: 200,
          },
        },
      },
    },
    npmFilesToBuild: [
      "@openzeppelin/contracts/proxy/ERC1967/ERC1967Proxy.sol",
      "@openzeppelin/contracts/proxy/transparent/ProxyAdmin.sol",
      "@openzeppelin/contracts/proxy/transparent/TransparentUpgradeableProxy.sol"
    ],
  },
  networks: {
    //本地Hardhat网络
    hardhatMainnet: {
      type: "edr-simulated",        //EDR引擎模拟网络
      chainType: "l1",
    },
    hardhatOp: {
      type: "edr-simulated",
      chainType: "op",
    },
    sepolia: {
      type: "http",
      chainType: "l1",
      url: process.env.SEPOLIA_RPC_URL || "",
      accounts: [
        process.env.SEPOLIA_ACCOUNT1_PRIVATE_KEY || "",
        process.env.SEPOLIA_ACCOUNT2_PRIVATE_KEY || "",
        process.env.SEPOLIA_ACCOUNT3_PRIVATE_KEY || "",
        process.env.SEPOLIA_ACCOUNT4_PRIVATE_KEY || "",
        process.env.SEPOLIA_ACCOUNT5_PRIVATE_KEY || "",
      ],
    },
  },
});




