import * as dotenv from 'dotenv';
import { Wallet } from './wallet';
import cosmosclient from '@cosmos-client/core';
import Long from 'long';
dotenv.config();

export class Chain {
  #wallet: Wallet;
  #sdk: cosmosclient.CosmosSDK;
  #gasLimit: string;
  #denom: string;
  #fee: string;

  constructor() {
    if (!process.env.REST_URL) {
      throw new Error('REST_URL is not set');
    }
    if (!process.env.CHAIN_ID) {
      throw new Error('CHAIN_ID is not set');
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
    this.#denom = process.env.DENOM;
    this.#fee = process.env.FEE;
  }

  async init() {
    await this.updateWallet();
    console.log('Wallet initialized');
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
      mode: cosmosclient.rest.tx.BroadcastTxMode.Block,
    });
    const code = res?.data?.tx_response?.code;
    if (code !== 0) {
      console.log(res.data.tx_response);
      throw new Error(`broadcast error`);
    }
    const txHash = res?.data?.tx_response?.txhash;
    return txHash || '';
  };

  fundAccount = async (to: string, amount: string): Promise<string> => {
    await this.updateWallet();
    const msgSend = new cosmosclient.proto.cosmos.bank.v1beta1.MsgSend({
      from_address: this.#wallet.address.toString(),
      to_address: to,
      amount: [{ denom: this.#denom, amount }],
    });
    const res = await this.#execTx(
      {
        gas_limit: Long.fromString(this.#gasLimit),
        amount: [{ denom: this.#denom, amount: this.#fee }],
      },
      [msgSend],
    );
    return res;
  };
}
