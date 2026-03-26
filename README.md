# Hardhat NFT 拍卖市场

基于 Hardhat 框架实现的 NFT 拍卖市场智能合约项目，支持 ETH 和 ERC20 代币竞拍，集成 Chainlink 价格预言机实现跨代币价格比较。

## 📋 目录

- [项目简介](#项目简介)
- [项目结构](#项目结构)
- [核心合约](#核心合约)
- [技术特点](#技术特点)
- [安装与运行](#安装与运行)
- [部署说明](#部署说明)
- [测试说明](#测试说明)
- [拍卖流程](#拍卖流程)
- [配置说明](#配置说明)

## 🎯 项目简介

本项目是一个完整的 NFT 拍卖市场解决方案，包含以下核心功能：

- ✅ NFT 铸造与管理
- ✅ 多代币竞拍支持（ETH/ERC20）
- ✅ 实时价格转换（Chainlink 预言机）
- ✅ 可升级合约架构（UUPS 模式）
- ✅ 平台手续费管理
- ✅ 完善的安全机制

## 📁 项目结构

```
hardhatV3NftWork/
├── contracts/                      # 智能合约目录
│   ├── NFTAuction.sol             # NFT 拍卖合约（主网版本）
│   ├── NFTAuctionFactory.sol      # 拍卖工厂合约
│   ├── NFTAuctionFactoryLocal.sol # 拍卖工厂合约（本地测试版本）
│   ├── NFTAuctionFactoryLocalV2.sol # 拍卖工厂合约V2版本（支持白名单）
│   ├── NFTAuctionLocal.sol        # NFT 拍卖合约（本地测试版本）
│   ├── TestNFT.sol                # ERC721 NFT 合约
│   └── USDC.sol                   # ERC20 USDC 代币合约
├── test/                           # 测试文件目录
│   ├── local/                     # 本地测试文件
│   │   ├── NFTAuctionFactoryLocal.ts
│   │   ├── NFTAuctionLocal.ts
│   │   ├── TestNFT.ts
│   │   └── USDC.ts
│   ├── sepolia/                   # Sepolia 测试网测试文件
│   │   ├── NFTAuctionFactorySepolia.ts
│   │   └── .cache/
│   │       └── contracts.example.json
│   └── uups/                      # UUPS 升级测试文件
│       └── NFTAuctionFactoryLocalV2.ts
├── ignition/                       # Hardhat Ignition 部署模块目录
│   └── modules/                   # 部署模块文件
│       ├── NFTAuctionFactoryLocalProxyModule.ts
│       ├── NFTAuctionModuleLocal.ts
│       ├── TestNFTModule.ts
│       ├── USDCModule.ts
│       └── UpgradeNFTAuctionFactoryLocalProxyModule.ts
├── scripts/                        # 部署和升级脚本
│   ├── .cache/                    # 部署缓存文件
│   │   └── deployment-cache.json
│   ├── deploy.ts                  # 部署脚本
│   └── upgrade.ts                 # 升级脚本
├── .env.example                    # 环境变量示例文件
├── .gitignore                      # Git 忽略文件
├── hardhat.config.ts               # Hardhat 配置文件
├── package.json                    # 项目依赖配置
├── package-lock.json               # 项目依赖锁定文件
├── tsconfig.json                   # TypeScript 配置文件
└── README.md                       # 项目说明文档
```

## 🔧 核心合约

### 1. TestNFT.sol

简单的 ERC721 NFT 合约，用于测试和演示。

**主要功能：**
- 铸造 NFT 并设置元数据 URI
- 继承 `ERC721`, `ERC721URIStorage`, `Ownable`
- 仅合约所有者可以铸造 NFT


### 2. USDC.sol

模拟 USDC 的 ERC20 代币合约。

**主要功能：**
- 6 位小数精度
- 铸造和销毁代币
- 初始铸造 1,000,000 USDC 给部署者

### 3. NFTAuction.sol

NFT 拍卖合约（主网版本），使用 Chainlink 价格预言机。

**主要功能：**
- 支持 ETH 和 ERC20 代币竞拍
- 实时价格转换和比较
- 自动退款机制
- 平台手续费计算和分配

**核心特性：**
- UUPS 可升级模式
- 重入保护（`ReentrancyGuardTransient`）
- 两步所有权转移（`Ownable2StepUpgradeable`）
- Chainlink 价格预言机集成

### 4. NFTAuctionFactory.sol

拍卖工厂合约，负责创建和管理拍卖合约实例。

**主要功能：**
- 创建拍卖合约代理实例
- 管理平台手续费（0.01% - 10%）
- 计算和收取手续费
- 维护拍卖 ID 映射


### 5. NFTAuctionLocal.sol

NFT 拍卖合约（本地测试版本），使用模拟价格预言机。

**主要功能：**
- 与 NFTAuction.sol 功能相同
- 使用固定价格模拟预言机
- 专为本地测试环境设计

**模拟价格：**
- ETH/USD: 3938.90988244
- USDC/USD: 1.000000

## ⚡ 技术特点

### 1. 可升级合约架构
- 使用 **UUPS (Universal Upgradeable Proxy Standard)** 模式
- 支持合约逻辑升级而不改变合约地址
- 更节省 Gas 费用

### 2. 多代币支持
- 支持 ETH 原生代币竞拍
- 支持任意 ERC20 代币竞拍
- 通过 Chainlink 预言机实现跨代币价格比较

### 3. 价格预言机集成
- 使用 Chainlink 价格预言机获取实时价格
- 支持多种代币的价格转换
- 精确的 USD 价格计算

### 4. 安全机制
- **重入保护**：使用 `ReentrancyGuardTransient` 防止重入攻击
- **两步所有权转移**：使用 `Ownable2StepUpgradeable` 提高安全性
- **参数验证**：严格的输入参数检查
- **错误处理**：使用自定义错误类型

### 5. 手续费管理
- 平台手续费比例：0.01% - 10%
- 通过工厂合约统一管理
- 自动计算和分配手续费

### 6. 自动退款机制
- 竞拍被超越时自动退款
- 支持 ETH 和 ERC20 退款
- 使用 `call` 方法进行 ETH 转账，提高安全性

## 🚀 测试运行

### 运行步骤
1.安装依赖
```bash
npm install
```

2.配置环境变量（如需部署到sepolia测试网）
复制.env.example为改为.env文件 修改下面配置
```shell
#metamask开发key
SEPOLIA_RPC_URL=https://sepolia.infura.io/v3/YOUR_INFURA_PROJECT_ID
# 4个账户必须要都有SEPOLIA测试网ETH
#账户1秘钥（需要拥有SEPOLIA测试网 USDC 5个token 测试会转账给账户4） 用于部署所有合约和代理合约
SEPOLIA_ACCOUNT1_PRIVATE_KEY=your_private_key_here
#账户2 模拟卖家
SEPOLIA_ACCOUNT2_PRIVATE_KEY=your_private_key_2_here
#账户3 模拟ETH竞拍买家
SEPOLIA_ACCOUNT3_PRIVATE_KEY=your_private_key_3_here
#账户4 模拟USDC竞拍买家
SEPOLIA_ACCOUNT4_PRIVATE_KEY=your_private_key_4_here
#账户5 用于收取手续费
SEPOLIA_ACCOUNT5_PRIVATE_KEY=your_private_key_5_here
```

3.配置环境变量（如需部署到测试网）
```bash
# 运行本地测试
npm run test:local

# 运行测试网测试(需要配置好.env)
npm run test:sepolia

# 本地覆盖率测试
npm run test:local:coverage

# 运行测试网覆盖率测试
npm run test:sepolia:coverage

# 单个it本地测试
npx hardhat test test/local或者sepolia/具体ts文件 --grep "it的描述" --network hardhatMainnet

# 运行单个it sepolia测试
npx hardhat test test/local或者sepolia/具体ts文件 --grep "it的描述" --network sepolia
```

## 🚀 部署说明

#### 部署合约

```bash
#部署命令文档地址 https://hardhat.org/ignition/docs/reference/cli-commands

# 本地网络部署
npm run deploy:local
# 升级
npm run upgrade:local

# Sepolia 测试网部署
npm run deploy:sepolia
# 升级
npm run upgrade:sepolia
```


