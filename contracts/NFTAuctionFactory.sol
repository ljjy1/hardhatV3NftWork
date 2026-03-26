// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;


import "./NFTAuction.sol";
import "@openzeppelin/contracts-upgradeable/access/Ownable2StepUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/proxy/utils/Initializable.sol";
import "@openzeppelin/contracts-upgradeable/proxy/utils/UUPSUpgradeable.sol";
import "@openzeppelin/contracts/proxy/ERC1967/ERC1967Proxy.sol";
import "@openzeppelin/contracts/token/ERC721/IERC721.sol";
import "@openzeppelin/contracts/token/ERC721/IERC721Receiver.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuardTransient.sol";



//NFT拍卖工厂 用于生产拍卖合约
contract NFTAuctionFactory is
    Initializable,   //初始化函数的安全保护机制，让 initialize 函数像构造函数一样「仅执行一次」 提供 initializer 修饰符和 _disableInitializers 函数
    UUPSUpgradeable,  //提供 UUPS 升级逻辑 可以调用upgradeToAndCall升级
    Ownable2StepUpgradeable,  //提供两步转移所有权逻辑
    ReentrancyGuardTransient //避免重入
{

    constructor(){
    }

    //定义一个参数错误
    error ParameterError(string msg);

    //NFT合约无效错误
    error InvalidNFTContract(address nftContract);

    //上架的NFT合约的tokenId不是卖家的错误
    error InvalidNFTOwner(address nftContract, uint256 tokenId, address owner);

    //NFT转移失败
    error NFTTransferFailed(address from, address to, uint256 tokenId);

    //拍卖ID到拍卖合约地址的映射
    mapping(uint256 => address) private auctionContracts;
    //平台接收手续费的地址
    address private feeReceiver;
    //平台手续费比例 万分之单位 100 = 100/10000 1%  必须在 0.01% - 10% 之间
    uint256 private feeRatio;
    //下一个拍卖ID
    uint256 private nextAuctionId;
    //NFTAuction 逻辑合约地址
    address private  auctionImplementation;



    // 拍卖工厂创建事件
    event AuctionFactoryCreated(
        address indexed feeReceiver,  //平台收取手续费的地址
        uint256 feeRatio //平台收取的手续费比例
    );

    // 拍卖合约创建事件
    event AuctionContractCreated(
        uint256 indexed auctionId,  //拍卖ID
        address indexed auctionContract,  //拍卖合约地址
        address indexed seller,  //卖家
        address nftContract,  //NFT合约地址
        uint256 tokenId,  //NFT ID
        uint256 duration,  //拍卖时长
        uint256 startPrice,  //起拍价格
        address payToken  //参与竞价的资产类型
    );


    /**
     * 初始化工厂合约
     * @param _feeReceiver 平台收取手续费的地址
     * @param _feeRatio 拍卖收取的手续费比例
     * @param _auctionImplementation NFTAuction 逻辑合约地址
     */
    function initialize(
        address _feeReceiver,
        uint256 _feeRatio,
        address _auctionImplementation
    ) public initializer {  //initializer 修饰符，保证初始化函数仅执行一次
        __Ownable_init(msg.sender);
        if(_feeReceiver == address(0)){
            revert ParameterError("feeReceiver is zero address");
        }
        // 0.01% - 10% 之间
        if(_feeRatio == 0){
            revert ParameterError("feeRatio is zero");
        }
        if(_feeRatio > 1000){
            revert ParameterError("feeRatio is too large");
        }
        if (_auctionImplementation == address(0)) {
            revert ParameterError("auctionImplementation cannot be zero address");
        }

        feeReceiver = _feeReceiver;
        feeRatio = _feeRatio;
        auctionImplementation = _auctionImplementation;
        nextAuctionId = 1;

        emit AuctionFactoryCreated(feeReceiver, feeRatio);
    }

    /**
     * 创建拍卖合约
     * 注意：卖家需要先调用 NFT 合约的 approve 授权指定的 tokenId 给工厂合约
     * @param _nftContract NFT合约地址
     * @param _tokenId NFT ID
     * @param _duration 拍卖时长（秒）
     * @param _startPrice 起拍价格
     * @param _payToken 参与竞价的资产类型（0x0 地址表示eth，其他地址表示erc20）
     * @return auctionId 拍卖ID
     * @return auctionContract 拍卖合约地址
     */
    function createAuction(
        address _nftContract,
        uint256 _tokenId,
        uint256 _duration,
        uint256 _startPrice,
        address _payToken
    ) external nonReentrant returns (uint256 auctionId, address auctionContract) {
        if (_nftContract == address(0)) {
            revert ParameterError("nftContract cannot be zero address");
        }
        if (_tokenId == 0) {
            revert ParameterError("tokenId cannot be zero");
        }
        if (_duration == 0) {
            revert ParameterError("duration cannot be zero");
        }
        if (_startPrice == 0) {
            revert ParameterError("startPrice cannot be zero");
        }
        if (auctionImplementation == address(0)) {
            revert ParameterError("auctionImplementation not set");
        }

        IERC721 nft = IERC721(_nftContract);

        //验证NFT合约
        if (!nft.supportsInterface(type(IERC721).interfaceId)) {
            revert InvalidNFTContract(_nftContract);
        }
        // 验证NFT合约的tokenId是否属于卖家
        if (nft.ownerOf(_tokenId) != msg.sender) {
            revert InvalidNFTOwner(_nftContract, _tokenId, msg.sender);
        }

        auctionId = nextAuctionId;

        // 创建拍卖合约代理合约
        bytes memory initData = abi.encodeWithSelector(
            NFTAuction.initialize.selector,
            msg.sender,
            _nftContract,
            _duration,
            _startPrice,
            _tokenId,
            _payToken,
            address(this),
            auctionId
        );

        ERC1967Proxy proxy = new ERC1967Proxy(
            auctionImplementation,
            initData
        );

        auctionContract = address(proxy);

        auctionContracts[auctionId] = auctionContract;
        nextAuctionId++;

        //通过工厂将卖家msg.sender的_tokenId代币转账给auctionContract
        //需要在调用本方法前createAuction 卖家授权代币给工厂合约
        nft.safeTransferFrom(msg.sender, auctionContract, _tokenId);

        emit AuctionContractCreated(
            auctionId,
            auctionContract,
            msg.sender,
            _nftContract,
            _tokenId,
            _duration,
            _startPrice,
            _payToken
        );

        return (auctionId, auctionContract);
    }

    /**
     * 获取手续费
     * @param _amount 拍卖金额
     * @return fee 手续费（基于 feeRatio 计算，feeRatio 单位为万分之）
     */
    function getFee(uint256 _amount) external view returns (uint256) {
        return _amount * feeRatio / 10000;
    }

    /**
     * 获取平台手续费收款地址
     * @return 平台手续费收款地址（可以是 ETH 或 ERC20）
     */
    function getFeeReceiver() external view returns (address) {
        return feeReceiver;
    }

    /**
     * 授权升级函数 - UUPS 升级模式必需
     * 只有合约所有者可以升级
     */
    function _authorizeUpgrade(address) internal override onlyOwner {
    }
}

