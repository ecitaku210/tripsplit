import { StoreProvider } from '../storage/store'
import { SyncProvider } from '../sync/SyncProvider'
import { useRoute, type Route } from './router'
import { HomeScreen } from './screens/HomeScreen'
import { TripScreen } from './screens/TripScreen'
import { ExpenseEditor } from './screens/ExpenseEditor'
import { ExpenseDetail } from './screens/ExpenseDetail'
import { SettleScreen } from './screens/SettleScreen'
import { ShareScreen } from './screens/ShareScreen'
import { PeopleScreen } from './screens/PeopleScreen'
import { ImportScreen } from './screens/ImportScreen'
import { HelpScreen } from './screens/HelpScreen'
import { ToastProvider } from './toast'

export function App() {
  return (
    <StoreProvider>
      <SyncProvider>
        <ToastProvider>
          <Shell />
        </ToastProvider>
      </SyncProvider>
    </StoreProvider>
  )
}

/** The page frame; home wears the glow, every other screen sits on black. */
function Shell() {
  const route = useRoute()
  return (
    <div className={`app${route.name === 'home' ? ' home' : ''}`}>
      <Routes route={route} />
    </div>
  )
}

function Routes({ route }: { route: Route }) {
  switch (route.name) {
    case 'trip':
      return <TripScreen tripId={route.tripId} />
    case 'expense':
      if (!route.edit && route.expenseId) {
        return <ExpenseDetail tripId={route.tripId} expenseId={route.expenseId} />
      }
      // `key` forces a fresh editor when switching between expenses, so the
      // form state never leaks from one expense into the next.
      return (
        <ExpenseEditor
          key={route.expenseId ?? 'new'}
          tripId={route.tripId}
          expenseId={route.expenseId}
        />
      )
    case 'settle':
      return <SettleScreen tripId={route.tripId} />
    case 'share':
      return <ShareScreen tripId={route.tripId} />
    case 'people':
      return <PeopleScreen tripId={route.tripId} />
    case 'import':
      return <ImportScreen payload={route.payload} />
    case 'help':
      return <HelpScreen />
    case 'home':
    default:
      return <HomeScreen />
  }
}
