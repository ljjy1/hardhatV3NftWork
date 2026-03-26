// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import "@openzeppelin/contracts/token/ERC20/extensions/IERC20Metadata.sol";
import "@openzeppelin/contracts-upgradeable/proxy/utils/Initializable.sol";
import "@openzeppelin/contracts-upgradeable/proxy/utils/UUPSUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/access/Ownable2StepUpgradeable.sol";
import "@openzeppelin/contracts/token/ERC721/IERC721Receiver.sol";
import "@openzeppelin/contracts/token/ERC721/IERC721.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuardTransient.sol";
import "@chainlink/contracts/src/v0.8/shared/interfaces/AggregatorV3Interface.sol";
import "@openzeppelin/contracts/utils/introspection/ERC165Checker.sol";

import {console} from "hardhat/console.sol";


contract NFTAuctionLocal is
    IERC721Receiver, //接收 ERC721 协议
    Initializable,   //初始化函数的安全保护机制，让 initialize 函数像构造函数一样「仅执行一次」 提供 initializer 修饰符和 _disableInitializers 函数
    UUPSUpgradeable,  //提供 UUPS 升级逻辑 可以调用upgradeToAndCall升级
    Ownable2StepUpgradeable,  //提供两步转移所有权逻辑
    ReentrancyGuardTransient //避免重入
{

    constructor(){
    }


    bytes4 public constant ERC721_INTERFACE_ID = type(IERC721).interfaceId;

    //定义一个参数错误
    error ParameterError(string msg);

    //合约无效错误
    error InvalidNFTContract(address nftContract);

    //上架的NFT合约的tokenId不是卖家的错误
    error InvalidNFTOwner(address nftContract, uint256 tokenId, address owner);

    //不支持竞拍的代币 payToken代币合约地址
    error InvalidPayToken(address payToken);

    //拍卖结束
    error AuctionAlreadyEnded();

    //ETH转入数量和出价不相等
    error ETHAmountNotEqualToBidAmount(uint256 ethAmount, uint256 bidAmount);

    //不能ETH和ERC20同时出价
    error CannotBidWithETHAndERC20(uint256 ethAmount, uint256 erc20Amount);

    //预言机错误
    error InvalidChainlinkPriceFeed(string msg);

    //NFT未授权
    error NFTNotApproved(address to, address nftContract, uint256 tokenId);

    //还不能结束拍卖
    error AuctionNotEnded();

    /**
     * 授权金额不足
     * @param payToken 授权的资产合约地址
     * @param approveAmount 授权的资产数量
     * @param bidAmount 出价数量
     */
    error InsufficientAllowance(address payToken, uint256 approveAmount, uint256 bidAmount);

    //卖家出价错误
    error SellerCannotBid();

    //竞价需要大于最高价
    error BidAmountNeedGtHighestBid();

    //转账失败
    error TransferFailed(address from, address to, uint256 amount);

    //退款失败
    error RefundFailed(address from, address to, uint256 amount);

    //工厂未设置手续费收款地址
    error NotPlatformFeePaymentAddress(address facatoryAdress);

    //获取手续费失败
    error GetFeeFailed(address facatoryAdress);

    // 模拟喂价映射，payToken地址 => USD价格
    mapping(address => uint256) private priceFeeds;

    //模拟的usdc合约地址
    address private usdcAddress;

    // 拍卖结构体
    struct Auction {
        address seller; // 卖家
        uint256 startTime; // 开始时间
        uint256 duration; // 拍卖时长（单位秒）
        uint256 startPrice; // 起拍价格
        bool ended; // 是否结束
        address highestBidder; // 最高出价者
        uint256 highestBid; // 最高出价
        address nftContract; // 拍卖的NFT合约地址
        uint256 tokenId; // NFT ID
        address payToken; // 参与竞价的资产类型（0x0 地址表示eth，其他地址表示erc20）
        address factory;    // 工厂合约地址，用于调用工厂合约的相关函数（如计算手续费，把手续费转给平台）
        uint256 auctionId;  //拍卖ID
    }

    // 拍卖信息存储
    Auction private auctionInfo;

    // 拍卖创建事件
    event AuctionCreated(
        address indexed seller,  //卖家
        address indexed nftContract,  //拍卖的NFT合约地址
        uint256 startTime, //开始时间
        uint256 duration, // 拍卖时长
        uint256 startPrice, // 起拍价格
        uint256 tokenId, // NFT ID
        address payToken, //参与竞价的资产类型（0x0 地址表示eth，其他地址表示erc20）
        uint256 auctionId   //拍卖ID
    );
    // 竞拍出价事件
    event BidPlaced(
        address indexed bidder,  //出价者
        address indexed nftContract,  //拍卖的NFT合约地址
        uint256 tokenId,  //NFT ID
        uint256 bid,  //出价价格
        address payToken //参与竞价的资产类型（0x0 地址表示eth，其他地址表示erc20）
    );
    // 拍卖结束事件
    event AuctionEnded(
        address indexed winner, // 拍卖结束的 winner 最后的最高价拍卖者
        address indexed nftContract, // 拍卖的NFT合约地址
        uint256 tokenId,   // NFT ID
        uint256 amount,  // 拍卖结束的是最高价的价格
        address payToken  //参与竞价的资产类型（0x0 地址表示eth，其他地址表示erc20）
    );

    //转移NFT事件
    event TransferNFT(address indexed nftContract, address indexed to, uint256 tokenId);

    /**
     * 初始化函数
     * @param _usdcAddress usdc合约地址
     * @param _seller 拍卖者
     * @param _nftContract nft合约
     * @param _duration 拍卖时长
     * @param _startPrice 起拍价格
     * @param _tokenId nft tokenId
     * @param _payToken 参与竞价的资产类型（0x0 地址表示eth，其他地址表示erc20）初始化必须传入和_startPrice搭配获取到对应USD价格
     * @param _factory 工厂合约地址，用于调用工厂合约的相关函数（如计算手续费，把手续费转给平台）
     * @param _auctionId 拍卖ID
     */
    function initialize(
        address _usdcAddress,
        address _seller,
        address _nftContract,
        uint256 _duration,
        uint256 _startPrice,
        uint256 _tokenId,
        address _payToken,
        address _factory,
        uint256 _auctionId
    ) public initializer {  //initializer 修饰符，保证初始化函数仅执行一次
        //初始化函数
        //设置所有者为调用方
        __Ownable_init(msg.sender);

        //当前@openzeppelin/contracts 5.6.1版本已经弃用UUPSUpgradeable.initialize()
        //ReentrancyGuardTransient没有需要初始化的值

        // 参数验证
        _validateInitializeParams(_usdcAddress, _seller, _nftContract, _duration, _startPrice, _tokenId, _factory, _auctionId);

        // 模拟初始化 ETH/USD 和 USDC/USD 价格预言机
        usdcAddress = _usdcAddress;
        _initPriceFeeds();

        // 初始化拍卖信息
        _initializeAuctionInfo(_seller, _nftContract, _duration, _startPrice, _tokenId, _payToken, _factory, _auctionId);
    }

    /**
     * 验证初始化参数
     */
    function _validateInitializeParams(
        address _usdcAddress,
        address _seller,
        address _nftContract,
        uint256 _duration,
        uint256 _startPrice,
        uint256 _tokenId,
        address _factory,
        uint256 _auctionId
    ) internal view {
        if (_usdcAddress == address(0)) {
            revert ParameterError("usdcAddress not be 0x0");
        }
        if (_seller == address(0)) {
            revert ParameterError("seller not be 0x0");
        }
        if (_nftContract == address(0)) {
            revert ParameterError("nftContract not be 0x0");
        }
        if (_duration == 0) {
            revert ParameterError("duration need > 0");
        }
        if (_startPrice == 0) {
            revert ParameterError("startPrice need > 0");
        }
        if (_tokenId == 0) {
            revert ParameterError("tokenId need > 0");
        }
        if (_factory == address(0)) {
            revert ParameterError("factory not be 0x0");
        }
        if (_auctionId == 0) {
            revert ParameterError("auctionId need > 0");
        }


        //获取合约实例并校验 如果_nftContract没有实现IERC721会直接事务回退
        if (!IERC721(_nftContract).supportsInterface(type(IERC721).interfaceId)) {
            revert InvalidNFTContract(_nftContract);
        }
    }

    /**
     * 初始化拍卖信息
     */
    function _initializeAuctionInfo(
        address _seller,
        address _nftContract,
        uint256 _duration,
        uint256 _startPrice,
        uint256 _tokenId,
        address _payToken,
        address _factory,
        uint256 _auctionId
    ) internal {
        // 如果是ERC20代币，需要交易拍卖是否支持此代币
        if (_payToken != address(0)) {
            if (priceFeeds[_payToken] == 0) {
                revert InvalidChainlinkPriceFeed("feed answer price <= 0");
            }
        }

        auctionInfo = Auction({
            seller: _seller,
            startTime: block.timestamp,
            duration: _duration,
            startPrice: _startPrice,
            ended: false,
            highestBidder: address(0),
            highestBid: 0,
            nftContract: _nftContract,
            tokenId: _tokenId,
            payToken: _payToken,
            factory: _factory,
            auctionId: _auctionId
        });

        //记录合约创建事件
        emit AuctionCreated(
            _seller,
            _nftContract,
            block.timestamp,
            _duration,
            _startPrice,
            _tokenId,
            _payToken,
            _auctionId
        );
    }

    /**
     * 竞拍出价
     * @param _payToken 竞拍的资产类型（0x0 地址表示eth，其他地址表示erc20）
     * @param _amount 竞拍的资产数量
     *
     * public表示函数公开的
     * payable 表示函数可以接受eth
     * virtual表示函数可以被继承
     * nonReentrant 不可重入
     */
    function placeBid(address _payToken, uint256 _amount) public payable virtual nonReentrant {
        //判断拍卖是否结束了
        if (auctionInfo.ended ||
            //判断当前时间是否超过拍卖结束时间 block.timestamp获取的时间是当前时间的秒时间戳
            block.timestamp > auctionInfo.startTime + auctionInfo.duration) {
            revert AuctionAlreadyEnded();
        }

        //出价金额必须大于0
        if (_amount <= 0) {
            revert ParameterError("amount need > 0");
        }

        //限制卖家自己出价
        if (auctionInfo.seller == msg.sender) {
            revert SellerCannotBid();
        }

        //判断出价类型
        if (_payToken == address(0)) {
            //判断出价的ETH数量是否等于_amount
            //msg.value当前转入的ETH数量 单位wei
            if (msg.value != _amount) {
                //ETH转入数量和出价不相等
                revert ETHAmountNotEqualToBidAmount(msg.value, _amount);
            }
        } else {
            //ERC20 出价
            if (msg.value != 0) {
                revert CannotBidWithETHAndERC20(msg.value, _amount);
            }

            //判断用户是否授权拍卖合约可以操作ERC20代币并且需要大于出价金额
            uint256 allowanceAmount = IERC20Metadata(_payToken).allowance(msg.sender, address(this));
            if (allowanceAmount < _amount) {
                revert InsufficientAllowance(_payToken, allowanceAmount, _amount);
            }
        }

        //通过预言机获取最大出价的USD价格
        uint256 hightestUSDValue = _getHightestUSDValue();
        console.log("hightestUSDValue", hightestUSDValue);

        // 计算出价的USD价值
        uint256 bidUSDValue = _calculateBidUSDValue(_payToken, _amount);
        console.log("bidUSDValue", bidUSDValue);

        //出价小于最高价格
        if (bidUSDValue <= hightestUSDValue) {
            revert BidAmountNeedGtHighestBid();
        }

        //保存上一个竞价者的信息用于退款
        address prevHighestBidder = auctionInfo.highestBidder;
        uint256 prevHighestBid = auctionInfo.highestBid;
        address prevPayToken = auctionInfo.payToken;

        //更新状态
        auctionInfo.highestBidder = msg.sender;
        auctionInfo.highestBid = _amount;
        auctionInfo.payToken = _payToken;

        //竞拍出价成功，如果是ERC20出价，则需要把出价金额转到本合约
        if (_payToken != address(0)) {
            //已经通过allowance判断了_payToken合约是否已经授权本合约可以操作的金额了
            //这里直接转账即可
            //这里使用transferFrom 引用是通过将别的地址的合约代币转入到我当前合约
            bool transferSuccess = IERC20Metadata(_payToken).transferFrom(msg.sender, address(this), _amount);
            if (!transferSuccess) {
                revert TransferFailed(msg.sender, address(this), _amount);
            }
        }

        //退回上一个竞价者的资产
        //需要判断有上一个竞价者和竞价资产大于0
        if (prevHighestBidder != address(0) && prevHighestBid > 0) {
            console.log("refund last highest bidder:", prevHighestBidder);
            //退款给上一个竞价者
            _refund(prevHighestBidder, prevPayToken, prevHighestBid);
        }

        emit BidPlaced(msg.sender, auctionInfo.nftContract, auctionInfo.tokenId, _amount, _payToken);
    }

    /**
     * 结束拍卖(任何人都可以调用进行结束)
     * nonReentrant 不可重入
     */
    function endAuction() public virtual nonReentrant {
        if (auctionInfo.ended) {
            revert AuctionAlreadyEnded();
        }
        //还没到时间不能结束拍卖
        if (block.timestamp < auctionInfo.startTime + auctionInfo.duration) {
            revert AuctionNotEnded();
        }
        //标记拍卖结束
        auctionInfo.ended = true;

        // 获取NFT合约实例
        IERC721 nft = IERC721(auctionInfo.nftContract);

        //判断有没有最高出价者
        if (auctionInfo.highestBidder != address(0)) {
            //将NFT转给最高出价者
            nft.safeTransferFrom(address(this), auctionInfo.highestBidder, auctionInfo.tokenId);

            //获取拍卖工厂的手续费和最终卖家能得到的金额
            (uint256 fee,uint256 sellerAmount) = _calculateFeeAndSellerAmount(auctionInfo.highestBid,auctionInfo.seller);

            //从工厂合约获取平台手续费收款地址(避免转给工厂让工厂还需要提取节省gas)
            address platformFeePaymentAddress = _getPlatformFeePaymentAddress();

            if(fee > 0){
                //转账给平台收款地址
                _refund(platformFeePaymentAddress, auctionInfo.payToken, fee);
            }
            //转账给卖家
            _refund(auctionInfo.seller, auctionInfo.payToken, sellerAmount);

            emit TransferNFT(auctionInfo.nftContract, auctionInfo.highestBidder, auctionInfo.tokenId);
        } else {
            //无人出价 将NFT转回卖家
            nft.safeTransferFrom(address(this), auctionInfo.seller, auctionInfo.tokenId);
            emit TransferNFT(auctionInfo.nftContract, auctionInfo.seller, auctionInfo.tokenId);
        }

        emit AuctionEnded(
            auctionInfo.highestBidder,
            auctionInfo.nftContract,
            auctionInfo.tokenId,
            auctionInfo.highestBid,
            auctionInfo.payToken
        );
    }

    /**
     * 获取拍卖工厂的手续费和最终卖家能得到的金额
     *
     */
    function _calculateFeeAndSellerAmount(uint256 _amount,address seller) internal virtual returns (uint256, uint256){
        //获取拍卖工厂的手续费 data getFee返回的字节数据 _amount getFee函数需要的参数(拍卖的金额)
        (bool success, bytes memory data) = auctionInfo.factory.call(abi.encodeWithSignature("getFee(uint256,address)", _amount,seller));
        if (!success) {
            revert GetFeeFailed(auctionInfo.factory);
        }
        //解码data得到手续费
        uint256 fee = abi.decode(data, (uint256));
        uint256 sellerAmount = _amount - fee;
        return (fee, sellerAmount);
    }

    /**
     * 获取平台手续费收款地址
     */
    function _getPlatformFeePaymentAddress() internal virtual returns (address) {
        (bool success, bytes memory data) = auctionInfo.factory.call(
            abi.encodeWithSignature("getFeeReceiver()")
        );
        if (!success) {
            revert NotPlatformFeePaymentAddress(auctionInfo.factory);
        }
        return abi.decode(data, (address));
    }

    /**
     * 退款函数
     */
    function _refund(address _to, address _payToken, uint256 amount) internal virtual {
        if (_to == address(0)) {
            revert ParameterError("_to need > 0");
        }
        if (amount <= 0) {
            revert ParameterError("amount need > 0");
        }

        if (_payToken == address(0)) {
            //ETH转账 使用call转账
            (bool success,) = payable(_to).call{value: amount}("");
            if (!success) {
                revert TransferFailed(_to, address(this), amount);
            }
        } else {
            //ERC20 转账
            //将当前合约存储在_payToken代币合约中的token转给_to账户
            IERC20(_payToken).transfer(_to, amount);
        }
    }

    /**
     * 获取当前最高出价USD价格
     * @return USD价格
     */
    function _getHightestUSDValue() internal view virtual returns (uint256) {
        uint256 price = priceFeeds[auctionInfo.payToken];
        if (price == 0) {
            revert InvalidChainlinkPriceFeed("feed answer price <= 0");
        }
        uint256 feedDecimal = 8; // 获取价格预言机小数位数

        // 获取当前最高出价，默认为起拍价格，如果有人出价，则最高出价为最高出价
        uint256 hightestAmount = auctionInfo.startPrice;

        //如果历史的最高出价人不是0
        if (auctionInfo.highestBidder != address(0)) {
            //判断历史历史最高价是否大于等于当前最高出价
            if (auctionInfo.highestBid >= hightestAmount) {
                hightestAmount = auctionInfo.highestBid;
            }
        }
        // 动态获取支付代币的小数位
        uint256 tokenDecimal;
        if (address(0) == auctionInfo.payToken) {
            tokenDecimal = 18; // ETH固定18位小数
        } else {
            //获取小数点位数  使用IERC20扩展接口 IERC20Metadata
            tokenDecimal = IERC20Metadata(auctionInfo.payToken).decimals();
        }

        // 核心换算：直接计算真实美元价格
        //price 预言机的默认扩了feedDecimal位小数 比如 2000(预言机价格)×10^8 = 200000000000
        //hightestAmount 扩了tokenDecimal位小数 例如 0.5 ETH×10^18 = 500000000000000000
        // 一定需要先 price * hightestAmount 扩大数值先相乘
        //错误做法 (price / (10 ** feedDecimal)) * (hightestAmount / (10 ** tokenDecimal)) 会丢失精度 导致不准
        return price * hightestAmount / (10 ** (tokenDecimal + feedDecimal));
    }

    /**
     * 计算出价USD价值
     * @param _payToken 竞拍的资产类型（0x0 地址表示eth，其他地址表示erc20）
     * @param _amount 竞拍的资产数量
     * @return USD价格
     */
    function _calculateBidUSDValue(address _payToken, uint256 _amount) internal view virtual returns (uint256) {
        uint256 price = priceFeeds[_payToken];
        if (price == 0) {
            revert InvalidChainlinkPriceFeed("feed answer price <= 0");
        }
        uint256 feedDecimal = 8; // 获取价格预言机小数位数
        // 动态获取支付代币的小数位
        uint256 tokenDecimal;
        if (address(0) == _payToken) {
            tokenDecimal = 18; // ETH固定18位小数
        } else {
            //获取小数点位数  使用IERC20扩展接口 IERC20Metadata
            tokenDecimal = IERC20Metadata(_payToken).decimals();
        }
        return price * _amount / (10 ** (tokenDecimal + feedDecimal));
    }

    /**
     * 初始化价格预言机
     */
    function _initPriceFeeds() internal {
        priceFeeds[address(0)] = 393890988244; // ETH/USD
        priceFeeds[usdcAddress] = 1000000000; // USDC/USD
    }

    /**
     * 实现onERC721Received函数 才可以接收NFT
     */
    function onERC721Received(
        address operator,
        address from,
        uint256 tokenId,
        bytes calldata data
    ) external pure override returns (bytes4) {
        return this.onERC721Received.selector;
    }

    /**
     * 通过onlyOwner修饰符限制 只有当前账户是合约创建者才能升级
     */
    function _authorizeUpgrade(
        address newImplementation
    ) internal override onlyOwner {}


}
