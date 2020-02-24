import { getTotalAmountFromPaymentList, getNativeTokenTxInput, toBNAmount, sendB58CheckEncodeTxToChain, getCoinInfoForCache, createHistoryInfo, getBurningAddress } from './utils';
import rpc from '@src/services/rpc';
import PaymentInfoModel from '@src/models/paymentInfo';
import AccountKeySetModel from '@src/models/key/accountKeySet';
import CoinModel from '@src/models/coin';
import wasmMethods from '@src/wasm/methods';
import { TxNormalType } from '@src/services/tx/constants';
import { createTx } from './sendNativeToken';
import { PDETradeRequestMeta } from '../wallet/constants';

interface TradeParam {
  accountKeySet: AccountKeySetModel,
  availableNativeCoins: CoinModel[],
  nativeFee: number,
  tradingFee: number,
  sellAmount: number,
  tokenIdBuy: TokenIdType,
  tokenIdSell: TokenIdType,
  minimumAcceptableAmount: number,
};

export default async function sendNativeTokenPdeTradeRequest({
  accountKeySet,
  availableNativeCoins,
  nativeFee,
  tradingFee,
  tokenIdBuy,
  tokenIdSell,
  sellAmount,
  minimumAcceptableAmount
} : TradeParam) {
  const usePrivacyForNativeToken = false;
  const nativeFeeBN = toBNAmount(nativeFee);
  const tradingFeeBN = toBNAmount(tradingFee);
  const sellAmountBN = toBNAmount(sellAmount);
  const minimumAcceptableAmountBN = toBNAmount(minimumAcceptableAmount);
  const burningAddress = await getBurningAddress();
  const nativePaymentInfoList = [
    new PaymentInfoModel({
      paymentAddress: burningAddress,
      amount: sellAmountBN.add(tradingFeeBN).toNumber(),
      message: ''
    })
  ];
  
  const nativePaymentAmountBN = getTotalAmountFromPaymentList(nativePaymentInfoList);
  const nativeTxInput = await getNativeTokenTxInput(accountKeySet, availableNativeCoins, nativePaymentAmountBN, nativeFeeBN, usePrivacyForNativeToken);

  console.log('nativeTxInput', nativeTxInput);

  const metaData =  {
    TokenIDToBuyStr: tokenIdBuy,
    TokenIDToSellStr: tokenIdSell,
    SellAmount: sellAmountBN.toNumber(),
    TraderAddressStr: accountKeySet.paymentAddressKeySerialized,
    Type: PDETradeRequestMeta,
    MinAcceptableAmount: minimumAcceptableAmountBN.toNumber(),
    TradingFee: tradingFeeBN.toNumber()
  };
  
  const txInfo = await createTx({
    nativeTxInput,
    nativePaymentInfoList,
    nativeTokenFeeBN: nativeFeeBN,
    nativePaymentAmountBN,
    privateKeySerialized: accountKeySet.privateKeySerialized,
    usePrivacyForNativeToken,
    initTxMethod: wasmMethods.initPRVTradeTx,
    metaData
  });
  
  console.log('txInfo', txInfo);

  const sentInfo = await sendB58CheckEncodeTxToChain(rpc.sendRawTx, txInfo.b58CheckEncodeTx);
  const { serialNumberList: nativeSpendingCoinSNs, listUTXO: nativeListUTXO } = getCoinInfoForCache(nativeTxInput.inputCoinStrs);
  
  return createHistoryInfo({
    txId: sentInfo.txId,
    lockTime: txInfo.lockTime,
    nativePaymentInfoList,
    nativeFee: nativeFeeBN.toNumber(),
    nativeListUTXO,
    nativePaymentAmount: nativePaymentAmountBN.toNumber(),
    nativeSpendingCoinSNs,
    txType: TxNormalType,
    accountPublicKeySerialized: accountKeySet.publicKeySerialized,
    usePrivacyForNativeToken,
    meta: metaData,
    devInfo: 'native token trade request'
  });
}