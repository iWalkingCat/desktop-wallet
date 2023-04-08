/*
Copyright 2018 - 2022 The Alephium Authors
This file is part of the alephium project.

The library is free software: you can redistribute it and/or modify
it under the terms of the GNU Lesser General Public License as published by
the Free Software Foundation, either version 3 of the License, or
(at your option) any later version.

The library is distributed in the hope that it will be useful,
but WITHOUT ANY WARRANTY; without even the implied warranty of
MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the
GNU Lesser General Public License for more details.

You should have received a copy of the GNU Lesser General Public License
along with the library. If not, see <http://www.gnu.org/licenses/>.
*/

import { getHumanReadableError } from '@alephium/sdk'
import { ALPH } from '@alephium/token-list'
import { ChainInfo, parseChain, PROVIDER_NAMESPACE, RelayMethod } from '@alephium/walletconnect-provider'
import {
  ApiRequestArguments,
  SignDeployContractTxParams,
  SignExecuteScriptTxParams,
  SignTransferTxParams
} from '@alephium/web3'
import SignClient from '@walletconnect/sign-client'
import { SignClientTypes } from '@walletconnect/types'
import { partition } from 'lodash'
import { createContext, useCallback, useContext, useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'

import client from '@/api/client'
import { useAppDispatch, useAppSelector } from '@/hooks/redux'
import ModalPortal from '@/modals/ModalPortal'
import SendModalDeployContract from '@/modals/SendModals/SendModalDeployContract'
import SendModalScript from '@/modals/SendModals/SendModalScript'
import { selectAllAddresses } from '@/storage/addresses/addressesSelectors'
import { walletConnectPairingFailed } from '@/storage/dApps/dAppActions'
import { AssetAmount } from '@/types/assets'
import {
  DappTxData,
  DeployContractTxData,
  ScriptTxData,
  TransferTxData,
  TxDataToModalType,
  TxType
} from '@/types/transactions'
import { AlephiumWindow } from '@/types/window'
import { extractErrorMsg } from '@/utils/misc'

type RequestEvent = SignClientTypes.EventArguments['session_request']
type ProposalEvent = SignClientTypes.EventArguments['session_proposal']

type WalletConnectSessionState = 'uninitialized' | 'proposal' | 'initialized'

export interface WalletConnectContextProps {
  walletConnectClient?: SignClient
  requestEvent?: RequestEvent
  proposalEvent?: ProposalEvent
  dappTxData?: DappTxData
  setDappTxData: (data?: DappTxData) => void
  onError: (error: string, event?: RequestEvent) => void
  deepLinkUri: string
  connectToWalletConnect: (uri: string) => void
  requiredChainInfo?: ChainInfo
  wcSessionState: WalletConnectSessionState
  sessionTopic?: string
  onSessionDelete: () => void
  onProposalApprove: (topic: string) => void
  connectedDAppMetadata?: ProposalEvent['params']['proposer']['metadata']
}

const initialContext: WalletConnectContextProps = {
  walletConnectClient: undefined,
  dappTxData: undefined,
  setDappTxData: () => null,
  requestEvent: undefined,
  onError: () => null,
  deepLinkUri: '',
  connectToWalletConnect: () => null,
  requiredChainInfo: undefined,
  wcSessionState: 'uninitialized',
  sessionTopic: undefined,
  onSessionDelete: () => null,
  onProposalApprove: () => null,
  connectedDAppMetadata: undefined
}

const WalletConnectContext = createContext<WalletConnectContextProps>(initialContext)

export const WalletConnectContextProvider: FC = ({ children }) => {
  const { t } = useTranslation()
  const addresses = useAppSelector(selectAllAddresses)
  const isAuthenticated = useAppSelector((s) => !!s.activeWallet.mnemonic)
  const dispatch = useAppDispatch()

  const [isDeployContractSendModalOpen, setIsDeployContractSendModalOpen] = useState(false)
  const [isCallScriptSendModalOpen, setIsCallScriptSendModalOpen] = useState(false)

  const [walletConnectClient, setWalletConnectClient] = useState(initialContext.walletConnectClient)
  const [dappTxData, setDappTxData] = useState(initialContext.dappTxData)
  const [requestEvent, setRequestEvent] = useState(initialContext.requestEvent)
  const [deepLinkUri, setDeepLinkUri] = useState(initialContext.deepLinkUri)
  const [wcSessionState, setWcSessionState] = useState(initialContext.wcSessionState)
  const [proposalEvent, setProposalEvent] = useState(initialContext.proposalEvent)
  const [requiredChainInfo, setRequiredChainInfo] = useState(initialContext.requiredChainInfo)
  const [sessionTopic, setSessionTopic] = useState(initialContext.sessionTopic)
  const [connectedDAppMetadata, setConnectedDappMetadata] = useState(initialContext.connectedDAppMetadata)

  const initializeWalletConnectClient = useCallback(async () => {
    try {
      const client = await SignClient.init({
        projectId: '6e2562e43678dd68a9070a62b6d52207',
        relayUrl: 'wss://relay.walletconnect.com',
        metadata: {
          name: 'Alephium desktop wallet',
          description: 'Alephium desktop wallet',
          url: 'https://github.com/alephium/desktop-wallet/releases',
          icons: ['https://alephium.org/favicon-32x32.png']
        }
      })

      setWalletConnectClient(client)
    } catch (e) {
      console.error('Could not initialize WalletConnect client', e)
    }
  }, [])

  useEffect(() => {
    if (!walletConnectClient) initializeWalletConnectClient()
  }, [initializeWalletConnectClient, walletConnectClient])

  const onError = useCallback(
    (error: string, event?: RequestEvent): void => {
      if (!walletConnectClient || !event) return

      walletConnectClient.respond({
        topic: event.topic,
        response: {
          id: event.id,
          jsonrpc: '2.0',
          error: {
            code: -32000,
            message: error
          }
        }
      })
    },
    [walletConnectClient]
  )

  const onSessionProposal = useCallback(async (proposalEvent: ProposalEvent) => {
    const { requiredNamespaces } = proposalEvent.params
    const requiredChains = requiredNamespaces[PROVIDER_NAMESPACE].chains
    const requiredChainInfo = parseChain(requiredChains[0])

    setRequiredChainInfo(requiredChainInfo)
    setProposalEvent(proposalEvent)
    setWcSessionState('proposal')
  }, [])

  const onSessionRequest = useCallback(
    async (event: RequestEvent) => {
      if (!walletConnectClient) return

      const getAddressByHash = (signerAddress: string) => {
        const address = addresses.find((a) => a.hash === signerAddress)
        if (!address) throw new Error(`Unknown signer address: ${signerAddress}`)

        return address
      }

      const setTxDataAndOpenModal = ({ txData, modalType }: TxDataToModalType) => {
        setDappTxData(txData)

        if (modalType === TxType.DEPLOY_CONTRACT) {
          setIsDeployContractSendModalOpen(true)
        } else if (modalType === TxType.SCRIPT) {
          setIsCallScriptSendModalOpen(true)
        }
      }

      setRequestEvent(event)

      const {
        params: { request }
      } = event

      try {
        switch (request.method as RelayMethod) {
          case 'alph_signAndSubmitTransferTx': {
            const p = request.params as SignTransferTxParams
            const dest = p.destinations[0]

            const txData: TransferTxData = {
              fromAddress: getAddressByHash(p.signerAddress),
              toAddress: p.destinations[0].address,
              assetAmounts: [
                { id: ALPH.id, amount: BigInt(dest.attoAlphAmount) },
                ...(dest.tokens ? dest.tokens.map((token) => ({ ...token, amount: BigInt(token.amount) })) : [])
              ],
              gasAmount: p.gasAmount,
              gasPrice: p.gasPrice?.toString()
            }

            setTxDataAndOpenModal({ txData, modalType: TxType.TRANSFER })
            break
          }
          case 'alph_signAndSubmitDeployContractTx': {
            const { initialAttoAlphAmount, bytecode, issueTokenAmount, gasAmount, gasPrice, signerAddress } =
              request.params as SignDeployContractTxParams
            const initialAlphAmount: AssetAmount | undefined = initialAttoAlphAmount
              ? { id: ALPH.id, amount: BigInt(initialAttoAlphAmount) }
              : undefined

            const txData: DeployContractTxData = {
              fromAddress: getAddressByHash(signerAddress),
              bytecode,
              initialAlphAmount,
              issueTokenAmount: issueTokenAmount?.toString(),
              gasAmount,
              gasPrice: gasPrice?.toString()
            }

            setTxDataAndOpenModal({ txData, modalType: TxType.DEPLOY_CONTRACT })
            break
          }
          case 'alph_signAndSubmitExecuteScriptTx': {
            const { tokens, bytecode, gasAmount, gasPrice, signerAddress, attoAlphAmount } =
              request.params as SignExecuteScriptTxParams
            let assetAmounts: AssetAmount[] = []
            let allAlphAssets: AssetAmount[] = attoAlphAmount ? [{ id: ALPH.id, amount: BigInt(attoAlphAmount) }] : []

            if (tokens) {
              const assets = tokens.map((token) => ({ id: token.id, amount: BigInt(token.amount) }))
              const [alphAssets, tokenAssets] = partition(assets, (asset) => asset.id === ALPH.id)

              assetAmounts = tokenAssets
              allAlphAssets = [...allAlphAssets, ...alphAssets]
            }

            if (allAlphAssets.length > 0) {
              assetAmounts.push({
                id: ALPH.id,
                amount: allAlphAssets.reduce((total, asset) => total + (asset.amount ?? BigInt(0)), BigInt(0))
              })
            }

            const txData: ScriptTxData = {
              fromAddress: getAddressByHash(signerAddress),
              bytecode,
              assetAmounts,
              gasAmount,
              gasPrice: gasPrice?.toString()
            }

            setTxDataAndOpenModal({ txData, modalType: TxType.SCRIPT })
            break
          }
          case 'alph_requestNodeApi': {
            const p = request.params as ApiRequestArguments
            const result = await client.web3.request(p)
            await walletConnectClient.respond({
              topic: event.topic,
              response: { id: event.id, jsonrpc: '2.0', result }
            })
            break
          }
          case 'alph_requestExplorerApi': {
            const p = request.params as ApiRequestArguments
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const call = (client.explorer as any)[`${p.path}`][`${p.method}`] as (...arg0: any[]) => Promise<any>
            const result = await call(...p.params)
            await walletConnectClient.respond({
              topic: event.topic,
              response: { id: event.id, jsonrpc: '2.0', result }
            })
            break
          }
          default:
            // TODO: support all of the other SignerProvider methods
            throw new Error(`Method not supported: ${request.method}`)
        }
      } catch (e) {
        console.error('Error while parsing WalletConnect session request', e)
        onError(extractErrorMsg(e), event)
      }
    },
    [addresses, onError, walletConnectClient]
  )

  const connectToWalletConnect = useCallback(
    async (uri: string) => {
      if (!walletConnectClient) return

      try {
        await walletConnectClient.pair({ uri })
        setDeepLinkUri('')
      } catch (e) {
        dispatch(walletConnectPairingFailed(getHumanReadableError(e, t('Could not pair with WalletConnect'))))
      }
    },
    [dispatch, t, walletConnectClient]
  )

  const onSessionDelete = useCallback(() => {
    setRequiredChainInfo(undefined)
    setProposalEvent(undefined)
    setWcSessionState('uninitialized')
    setSessionTopic(undefined)
  }, [])

  const onProposalApprove = (topic: string) => {
    setSessionTopic(topic)
    setConnectedDappMetadata(proposalEvent?.params.proposer.metadata)
    setProposalEvent(undefined)
    setWcSessionState('initialized')
  }

  useEffect(() => {
    if (!walletConnectClient) return

    walletConnectClient.on('session_request', onSessionRequest)
    walletConnectClient.on('session_proposal', onSessionProposal)
    walletConnectClient.on('session_delete', onSessionDelete)

    return () => {
      walletConnectClient.removeListener('session_request', onSessionRequest)
      walletConnectClient.removeListener('session_proposal', onSessionProposal)
      walletConnectClient.removeListener('session_delete', onSessionDelete)
    }
  }, [onSessionDelete, onSessionProposal, onSessionRequest, walletConnectClient])

  useEffect(() => {
    const _window = window as unknown as AlephiumWindow
    _window.electron?.walletConnect.onSetDeepLinkUri((deepLinkUri) => {
      setDeepLinkUri(deepLinkUri)

      if (isAuthenticated) connectToWalletConnect(deepLinkUri)
    })
  }, [connectToWalletConnect, isAuthenticated])

  return (
    <WalletConnectContext.Provider
      value={{
        requestEvent,
        proposalEvent,
        walletConnectClient,
        dappTxData,
        setDappTxData,
        onError,
        deepLinkUri,
        connectToWalletConnect,
        requiredChainInfo,
        wcSessionState,
        onSessionDelete,
        sessionTopic,
        onProposalApprove,
        connectedDAppMetadata
      }}
    >
      {children}
      <ModalPortal>
        {isDeployContractSendModalOpen && (
          <SendModalDeployContract onClose={() => setIsDeployContractSendModalOpen(false)} />
        )}
        {isCallScriptSendModalOpen && dappTxData && (
          <SendModalScript
            initialStep="info-check"
            initialTxData={dappTxData}
            txData={dappTxData as ScriptTxData}
            onClose={() => setIsCallScriptSendModalOpen(false)}
          />
        )}
      </ModalPortal>
    </WalletConnectContext.Provider>
  )
}

export const useWalletConnectContext = () => useContext(WalletConnectContext)
