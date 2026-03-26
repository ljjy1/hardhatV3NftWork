// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;


import "./NFTAuctionFactoryLocal.sol";

/**
 * 拍卖工厂V2版本 添加白名单不收取手续费
 */
contract NFTAuctionFactoryLocalV2 is NFTAuctionFactoryLocal
{
    //白名单地址
    mapping(address => bool) private whiteList;


    function _getFee(uint256 _amount,address seller) internal view virtual override returns (uint256) {
        if(seller != address(0)){
            if(whiteList[seller]){
                return 0;
            }
        }
        return _amount * getFeeRatio() / 10000;
    }

    /**
      * 添加白名单
      */
    function addWhite(address _whiteAddress) public onlyOwner {
        whiteList[_whiteAddress] = true;
    }

    /**
      * 移除白名单
      */
    function removeWhite(address _whiteAddress) public onlyOwner {
        delete whiteList[_whiteAddress];
    }


}