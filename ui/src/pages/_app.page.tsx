import "../styles/globals.css";
import { useEffect, useState } from "react";
import "./reactCOIServiceWorker";

import ZkappWorkerClient from "./zkappWorkerClient";

import { PublicKey, Field } from "snarkyjs";

let transactionFee = 0.1;

export default function App() {
  let [state, setState] = useState({
    zkappWorkerClient: null as null | ZkappWorkerClient,
    hasWallet: null as null | boolean,
    hasBeenSetup: false,
    accountExists: false,
    currentNum: null as null | Field,
    publicKey: null as null | PublicKey,
    zkappPublicKey: null as null | PublicKey,
    creatingTransaction: false,
  });

  useEffect(() => {
    (async () => {
      if (!state.hasBeenSetup) {
        const zkappWorkerClient = new ZkappWorkerClient();

        console.log("Loading SnarkyJS...");
        await zkappWorkerClient.loadSnarkyJS();
        console.log("Done!");

        await zkappWorkerClient.setActiveInstanceToBerkeley();

        const mina = (window as any).mina;
        if (mina == null) {
          setState({ ...state, hasWallet: false });
          return;
        }

        const publicKeyBase58: string = (await mina.requestAccounts())[0];
        const publicKey = PublicKey.fromBase58(publicKeyBase58);

        console.log(`Using key: ${publicKey.toBase58()}`);

        console.log("Checking if account exists...");
        const res = await zkappWorkerClient.fetchAccount({
          publicKey: publicKey!,
        });
        const accountExists = res.error == null;

        await zkappWorkerClient.loadContract();

        console.log("Compiling zkApp");
        await zkappWorkerClient.compileContract();
        console.log("zkApp compiled!");

        const zkappPublicKey = PublicKey.fromBase58(
          "B62qiqD8k9fAq94ejkvzaGEV44P1uij6vd6etGLxcR4dA8ZRZsxkwvR"
        );

        await zkappWorkerClient.initZkappInstance(zkappPublicKey);

        console.log("Getting zkApp state...");
        await zkappWorkerClient.fetchAccount({ publicKey: zkappPublicKey });
        const currentNum = await zkappWorkerClient.getNum();
        console.log(`Current state: ${currentNum.toString()}`);

        setState({
          ...state,
          zkappWorkerClient,
          hasWallet: true,
          hasBeenSetup: true,
          publicKey,
          zkappPublicKey,
          accountExists,
          currentNum,
        });
      }
    })();
  }, []);

  useEffect(() => {
    (async () => {
      if (state.hasBeenSetup && !state.accountExists) {
        for (;;) {
          console.log("Checking if account exists...");
          const res = await state.zkappWorkerClient!.fetchAccount({
            publicKey: state.publicKey!,
          });
          const accountExists = res.error == null;
          if (accountExists) {
            break;
          }
          await new Promise((resolve) => setTimeout(resolve, 5000));
        }
        setState({ ...state, accountExists: true });
      }
    })();
  }, [state.hasBeenSetup]);

  const onSendTransaction = async () => {
    setState({ ...state, creatingTransaction: true });
    console.log("Sending a transaction...");

    await state.zkappWorkerClient!.fetchAccount({
      publicKey: state.publicKey!,
    });

    await state.zkappWorkerClient!.createUpdateTransaction();

    console.log("Creating proof...");
    await state.zkappWorkerClient!.proveUpdateTransaction();

    console.log("Getting transaction JSON...");
    const transactionJSON = await state.zkappWorkerClient!.getTransactionJSON();

    console.timeLog("Requesting send transaction...");

    const { hash } = await (window as any).mina.onSendTransaction({
      transaction: transactionJSON,
      feePayer: {
        fee: transactionFee,
        memo: "",
      },
    });

    console.log(
      `See transaction at https://berkeley.minaexplorer.com/transaction/${hash}`
    );

    setState({ ...state, creatingTransaction: false });
  };

  const onRefreshCurrentNum = async () => {
    console.timeLog("Getting zkApp state...");
    await state.zkappWorkerClient!.fetchAccount({
      publicKey: state.zkappPublicKey!,
    });
    const currentNum = await state.zkappWorkerClient!.getNum();
    console.log(`Current state: ${currentNum.toString()}`);

    setState({ ...state, currentNum });
  };

  //UI elements

  let hasWallet;

  if (state.hasWallet != null && !state.hasWallet) {
    const auroLink = "https://www.aurowallet.com/";
    const auroLinkElem = (
      <a href={auroLink} target="_blank" rel="noreferrer">
        {" "}
        [Link]{" "}
      </a>
    );

    hasWallet = (
      <div>
        {" "}
        Could not find a wallet. Install Auro wallet here: {auroLinkElem}
      </div>
    );
  }

  let setupText = state.hasBeenSetup
    ? "SnarkyJS ready!"
    : "Setting up SnarkyJS...";

  let setup = (
    <div>
      {" "}
      {setupText} {hasWallet}
    </div>
  );

  let accountDoesNotExist;
  if (state.hasBeenSetup && !state.accountExists) {
    const faucetLink = `'https://faucet.minaprotocol.com/?address=${state.publicKey!.toBase58()}`;
    accountDoesNotExist = (
      <div>
        Account does not exist. Please visit the faucet to fund this account
        <a href={faucetLink} target="_blank" rel="noreferrer">
          {" "}
          [Link]{" "}
        </a>
      </div>
    );
  }

  let mainContent;
  if (state.hasBeenSetup && state.accountExists) {
    mainContent = (
      <div>
        <button
          onClick={onSendTransaction}
          disabled={state.creatingTransaction}
        >
          {" "}
          Send Transaction{" "}
        </button>
        <div>Current Number in zkApp: {state.currentNum!.toString()}</div>
        <button onClick={onRefreshCurrentNum}>Get latest state</button>
      </div>
    );
  }

  return (
    <div>
      {setup}
      {accountDoesNotExist}
      {mainContent}
    </div>
  );
}
