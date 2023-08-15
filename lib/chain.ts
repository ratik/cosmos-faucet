import * as dotenv from 'dotenv';
import { Wallet } from './wallet';
import cosmosclient from '@cosmos-client/core';
import cosmwasmproto from '@cosmos-client/cosmwasm';
import Long from 'long';
dotenv.config();

export class Chain {
  #wallet: Wallet;
  #sdk: cosmosclient.CosmosSDK;
  #gasLimit: string;
  #contracts: string[];
  #denom: string;
  #fee: string;

  constructor() {
    if (!process.env.REST_URL) {
      throw new Error('REST_URL is not set');
    }
    if (!process.env.CHAIN_ID) {
      throw new Error('CHAIN_ID is not set');
    }
    if (!process.env.CW20_TOKENS) {
      throw new Error('CW20_TOKENS is not set');
    }
    if (!process.env.DENOM) {
      throw new Error('DENOM is not set');
    }
    if (!process.env.GAS_LIMIT) {
      throw new Error('GAS_LIMT is not set');
    }
    if (!process.env.FEE) {
      throw new Error('FEE is not set');
    }
    this.#sdk = new cosmosclient.CosmosSDK(
      process.env.REST_URL,
      process.env.CHAIN_ID,
    );
    this.#gasLimit = process.env.GAS_LIMIT;
    this.#contracts = process.env.CW20_TOKENS.split(',');
    this.#denom = process.env.DENOM;
    this.#fee = process.env.FEE;
  }

  async init() {
    await this.updateWallet();
    console.log(
      'Wallet initialized. Faucet address:',
      this.#wallet.account?.address.toString(),
    );
  }

  async updateWallet() {
    if (!process.env.MNEMONIC) {
      throw new Error('MNEMONIC is not set');
    }
    if (!process.env.CHAIN_PREFIX) {
      console.log(process.env);
      throw new Error('CHAIN_PREFIX is not set');
    }
    this.#wallet = await this.#mnemonicToWallet(
      cosmosclient.AccAddress,
      process.env.MNEMONIC,
      process.env.CHAIN_PREFIX,
    );
  }

  #mnemonicToWallet = async (
    walletType: {
      fromPublicKey: (
        k: cosmosclient.PubKey,
      ) => cosmosclient.AccAddress | cosmosclient.ValAddress;
    },
    mnemonic: string,
    addrPrefix: string,
  ): Promise<Wallet> => {
    const privKey = new cosmosclient.proto.cosmos.crypto.secp256k1.PrivKey({
      key: await cosmosclient.generatePrivKeyFromMnemonic(mnemonic),
    });

    const pubKey = privKey.pubKey();
    const address = walletType.fromPublicKey(pubKey);
    let account;
    cosmosclient.config.setBech32Prefix({
      accAddr: addrPrefix,
      accPub: `${addrPrefix}pub`,
      valAddr: `${addrPrefix}valoper`,
      valPub: `${addrPrefix}valoperpub`,
      consAddr: `${addrPrefix}valcons`,
      consPub: `${addrPrefix}valconspub`,
    });
    // eslint-disable-next-line no-prototype-builtins
    if (cosmosclient.ValAddress !== walletType) {
      account = await cosmosclient.rest.auth
        .account(this.#sdk, address)
        .then((res) =>
          cosmosclient.codec.protoJSONToInstance(
            cosmosclient.codec.castProtoJSONOfProtoAny(res.data.account),
          ),
        )
        .catch((e) => {
          console.log(e);
          throw e;
        });

      if (
        !(account instanceof cosmosclient.proto.cosmos.auth.v1beta1.BaseAccount)
      ) {
        throw new Error("can't get account");
      }
    }
    return new Wallet(address, account, pubKey, privKey, addrPrefix);
  };

  #execTx = async <T extends { constructor: Function }>(
    fee: cosmosclient.proto.cosmos.tx.v1beta1.IFee,
    msgs: T[],
  ): Promise<string> => {
    if (!this.#wallet.account) {
      throw new Error('wallet.account is undefined');
    }
    const protoMsgs = msgs.map((msg) =>
      cosmosclient.codec.instanceToProtoAny(msg),
    );
    const txBody = new cosmosclient.proto.cosmos.tx.v1beta1.TxBody({
      messages: protoMsgs,
    });
    const authInfo = new cosmosclient.proto.cosmos.tx.v1beta1.AuthInfo({
      signer_infos: [
        {
          public_key: cosmosclient.codec.instanceToProtoAny(
            this.#wallet.pubKey,
          ),
          mode_info: {
            single: {
              mode: cosmosclient.proto.cosmos.tx.signing.v1beta1.SignMode
                .SIGN_MODE_DIRECT,
            },
          },
          sequence: this.#wallet.account.sequence,
        },
      ],
      fee,
    });
    const txBuilder = new cosmosclient.TxBuilder(this.#sdk, txBody, authInfo);

    const signDocBytes = txBuilder.signDocBytes(
      this.#wallet.account.account_number,
    );

    txBuilder.addSignature(this.#wallet.privKey.sign(signDocBytes));
    const res = await cosmosclient.rest.tx.broadcastTx(this.#sdk, {
      tx_bytes: txBuilder.txBytes(),
      mode: cosmosclient.rest.tx.BroadcastTxMode.Sync,
    });
    const code = res?.data?.tx_response?.code;
    if (code !== 0) {
      console.log(res.data.tx_response);
      throw new Error(`broadcast error`);
    }
    const txHash = res?.data?.tx_response?.txhash;
    return txHash || '';
  };

  fundAccount = async (to: string, amount: string, numAttempts = 20, waitTime = 1000): Promise<string> => {
    let mintMsgs: cosmwasmproto.proto.cosmwasm.wasm.v1.MsgExecuteContract[] =
      this.#contracts.map((c) => {
        return new cosmwasmproto.proto.cosmwasm.wasm.v1.MsgExecuteContract({
          sender: this.#wallet.account?.address.toString(),
          contract: c,
          msg: Buffer.from(
            JSON.stringify({
              mint: {
                recipient: to,
                amount: amount,
              },
            }),
          ),
        });
      });

    await this.updateWallet();
    console.log('sending funds to', to);
    const txHash = await this.#execTx(
      {
        gas_limit: Long.fromString(this.#gasLimit),
        amount: [{ denom: this.#denom, amount: this.#fee }],
      },
      mintMsgs,
    );

    let error = null;
    while (numAttempts > 0) {
      await new Promise((r) => {
        setTimeout(() => r(true), waitTime);
      });
      numAttempts--;
      const data = await cosmosclient.rest.tx
          .getTx(this.#sdk, txHash)
          .catch((reason) => {
            error = reason;
            return null;
          });
      if (data != null) {
        return data?.data?.tx_response?.txhash;
      }
    }
    error = error ?? new Error('tx not included in block');
    throw error;
  };
}