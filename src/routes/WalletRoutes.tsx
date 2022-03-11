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

import { useEffect } from 'react'
import { Route, Switch, useHistory, useLocation } from 'react-router-dom'

import { useGlobalContext } from '../contexts/global'
import AddressDetailsPage from '../pages/Wallet/AddressDetailsPage'
import AddressesPage from '../pages/Wallet/AddressesPage'
import OverviewPage from '../pages/Wallet/OverviewPage'
import WalletLayout from '../pages/Wallet/WalletLayout'

const WalletRoutes = () => {
  const { wallet } = useGlobalContext()
  const history = useHistory()
  const location = useLocation()

  // Redirect if wallet is not set
  useEffect(() => {
    if (!wallet) {
      history.push('/')
    }
  }, [history, wallet])

  return (
    <Route path="/wallet">
      <WalletLayout>
        <Switch location={location} key={location.pathname}>
          <Route path="/wallet/overview" key="overview">
            <OverviewPage />
          </Route>
          <Route path="/wallet/addresses/:addressHash" key="address-details">
            <AddressDetailsPage />
          </Route>
          <Route path="/wallet/addresses" key="addresses">
            <AddressesPage />
          </Route>
        </Switch>
      </WalletLayout>
    </Route>
  )
}

export default WalletRoutes