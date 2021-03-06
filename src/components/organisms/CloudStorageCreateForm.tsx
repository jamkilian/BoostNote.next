import React, { useState, useCallback, useRef, useMemo } from 'react'
import {
  FormGroup,
  FormLabel,
  FormPrimaryButton,
  FormTextInput,
  FormSecondaryButton,
  FormCheckItem,
  FormBlockquote,
} from '../atoms/form'
import { useTranslation } from 'react-i18next'
import { useRouter } from '../../lib/router'
import { useDb } from '../../lib/db'
import { useToast } from '../../lib/toast'
import Spinner from '../atoms/Spinner'
import {
  getStorages,
  CloudStorage,
  createStorage as createCloudStorage,
  useUsers,
} from '../../lib/accounts'
import { useFirstUser, usePreferences } from '../../lib/preferences'
import { useEffectOnce } from 'react-use'
import LoginButton from '../atoms/LoginButton'
import { useAnalytics, analyticsEvents } from '../../lib/analytics'

const CloudStorageCreateForm = () => {
  const [storageName, setStorageName] = useState('')
  const [cloudStorageName, setCloudStorageName] = useState('')
  const { t } = useTranslation()
  const { push } = useRouter()
  const db = useDb()
  const { pushMessage } = useToast()
  const [creating, setCreating] = useState(false)
  const user = useFirstUser()
  const [, { removeUser }] = useUsers()
  const { preferences } = usePreferences()

  const [fetching, setFetching] = useState(false)
  const [remoteStorageList, setRemoteStorageList] = useState<CloudStorage[]>([])

  const [usingSameName, setUsingSameName] = useState(true)

  const [targetRemoteStorageId, setTargetRemoteStorageId] = useState<
    null | string
  >(null)

  const { report } = useAnalytics()

  const targetRemoteStorage = useMemo(() => {
    for (const remoteStorage of remoteStorageList) {
      if (remoteStorage.id.toString() === targetRemoteStorageId) {
        return remoteStorage
      }
    }
    return null
  }, [remoteStorageList, targetRemoteStorageId])

  const createStorageCallback = useCallback(async () => {
    setCreating(true)
    try {
      const cloudStorage =
        targetRemoteStorage == null
          ? await createCloudStorage(
              usingSameName ? storageName : cloudStorageName,
              user
            )
          : targetRemoteStorage
      if (cloudStorage === 'SubscriptionRequired') {
        pushMessage({
          title: 'Subscription Required',
          description:
            'Please update subscription to create more cloud storage.',
        })
        setCreating(false)
        return
      }
      const storage = await db.createStorage(storageName)
      db.linkStorage(storage.id, {
        id: cloudStorage.id,
        name: cloudStorage.name,
        size: cloudStorage.size,
      })
      db.syncStorage(storage.id)
      report(analyticsEvents.createStorage)
      push(`/app/storages/${storage.id}/notes`)
    } catch (error) {
      pushMessage({
        title: 'Error',
        description: error.toString(),
      })
      setCreating(false)
    }
  }, [
    targetRemoteStorage,
    usingSameName,
    storageName,
    cloudStorageName,
    user,
    db,
    push,
    pushMessage,
    report,
  ])

  const unmountRef = useRef(false)

  const fetchRemoteStorage = useCallback(async () => {
    if (user == null) {
      return
    }
    setFetching(true)
    setRemoteStorageList([])
    try {
      const storages = await getStorages(user)
      if (!unmountRef.current) {
        setRemoteStorageList(storages)
        setFetching(false)
      }
    } catch (error) {
      pushMessage({
        title: 'Failed to fetch legacy cloud space list',
        description: error.toString(),
      })
    }
  }, [user, pushMessage])

  useEffectOnce(() => {
    fetchRemoteStorage()
    return () => {
      unmountRef.current = true
    }
  })

  const boosthubUserInfo = preferences['cloud.user']

  const cloudWorkspaceNotice = (
    <FormBlockquote>
      <p style={{ marginTop: 0 }}>
        Please consider to use{' '}
        <strong>
          <a
            href='/app/boosthub/login'
            onClick={(event) => {
              event.preventDefault()
              if (boosthubUserInfo == null) {
                push('/app/boosthub/login')
              } else {
                push('/app/boosthub/teams')
              }
            }}
          >
            new cloud space feature
          </a>
        </strong>{' '}
        instead of the legacy cloud storage.
      </p>
      <p style={{ marginTop: 0, marginBottom: 0 }}>
        It supports <strong>realtime collaboration editing</strong> and more
        other features for teams so you can use Boost Note with your coworkers.
      </p>
    </FormBlockquote>
  )
  if (user == null) {
    return (
      <>
        {cloudWorkspaceNotice}
        <LoginButton
          onErr={() => {
            pushMessage({
              title: 'Cloud Error',
              description:
                'An error occured while attempting to create a legacy cloud space',
            })
          }}
          ButtonComponent={FormPrimaryButton}
        />
      </>
    )
  }

  return (
    <>
      {cloudWorkspaceNotice}
      <FormGroup>
        <FormLabel>Remote Space</FormLabel>
        <FormCheckItem
          id='radio-remote-storage-new'
          type='radio'
          checked={targetRemoteStorage == null}
          onChange={(event) => {
            if (event.target.checked) {
              setStorageName('')
              setCloudStorageName('')
              setTargetRemoteStorageId('new')
            }
          }}
        >
          New Space
        </FormCheckItem>
        <hr />
        {!fetching && remoteStorageList.length === 0 && (
          <p>No space has been fetched. Click refresh button to try again.</p>
        )}
        {remoteStorageList.map((cloudStorage) => {
          const cloudStorageId = cloudStorage.id.toString()
          const id = `radio-remote-storage-${cloudStorageId}`
          return (
            <FormCheckItem
              id={id}
              key={id}
              type='radio'
              checked={targetRemoteStorageId === cloudStorageId}
              onChange={(event) => {
                if (event.target.checked) {
                  setStorageName(cloudStorage.name)
                  setTargetRemoteStorageId(cloudStorageId)
                }
              }}
            >
              {cloudStorage.name} (id: {cloudStorage.id})
            </FormCheckItem>
          )
        })}
      </FormGroup>
      {fetching && (
        <FormGroup>
          <Spinner /> Fetching spaces in the legacy cloud...
        </FormGroup>
      )}
      <FormGroup>
        <FormSecondaryButton onClick={fetchRemoteStorage} disabled={fetching}>
          Refresh spaces in the legacy cloud
        </FormSecondaryButton>
        <FormSecondaryButton
          onClick={() => {
            removeUser(user)
          }}
        >
          Sign Out
        </FormSecondaryButton>
      </FormGroup>

      <FormGroup>
        <FormLabel>{t('storage.name')}</FormLabel>
        <FormTextInput
          type='text'
          value={
            usingSameName && targetRemoteStorage != null
              ? targetRemoteStorage!.name
              : storageName
          }
          disabled={usingSameName && targetRemoteStorage != null}
          onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
            setStorageName(e.target.value)
          }
        />
      </FormGroup>
      <FormGroup>
        <FormCheckItem
          id='checkbox-same-storage-name'
          checked={usingSameName}
          onChange={(event) => {
            if (!event.target.checked) {
              setCloudStorageName(storageName)
            }
            setUsingSameName(event.target.checked)
          }}
        >
          Use the same name for legacy cloud space
        </FormCheckItem>
      </FormGroup>
      {!usingSameName && targetRemoteStorage == null && (
        <FormGroup>
          <FormLabel>Space name in the legacy cloud</FormLabel>
          <FormTextInput
            type='text'
            value={cloudStorageName}
            onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
              setCloudStorageName(e.target.value)
            }
          />
        </FormGroup>
      )}
      <FormGroup>
        <FormPrimaryButton
          onClick={createStorageCallback}
          disabled={creating || fetching}
        >
          {creating
            ? 'Creating...'
            : fetching
            ? 'Fetching spaces from the legacy cloud...'
            : 'Create Space'}
        </FormPrimaryButton>
      </FormGroup>
    </>
  )
}

export default CloudStorageCreateForm
