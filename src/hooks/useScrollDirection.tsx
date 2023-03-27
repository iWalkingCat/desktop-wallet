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
import { useEffect, useRef, useState } from 'react'

import { useScrollContext } from '@/contexts/scroll'

const useScrollDirection = (threshold: number) => {
  const { scroll } = useScrollContext()
  const [direction, setDirection] = useState<'up' | 'down'>()
  const prevScrollY = useRef<number | undefined>()

  useEffect(() => {
    const currentScrollY = scroll?.scrollTop

    if (prevScrollY.current !== undefined) {
      const diff = prevScrollY.current - (currentScrollY || 0)

      if (diff > threshold && direction !== 'up') {
        setDirection('up')
      } else if (diff < -threshold && direction !== 'down') {
        setDirection('down')
      }
    }

    prevScrollY.current = currentScrollY
  }, [direction, scroll?.scrollTop, threshold])

  return direction
}

export default useScrollDirection
