import {addBinderComment, __private} from '../src/binder'
import nock from 'nock'

beforeEach(() => {
  nock.disableNetConnect()
})

afterEach(() => {
  if (!nock.isDone()) {
    nock.cleanAll()
    throw new Error('Not all nock calls were made')
  }
})

// Check no other requests are made
nock.emitter.on('no match', (req: any) => {
  throw new Error(
    `Unexpected request ${req.method} ${req.path}: ${JSON.stringify(
      req.options
    )}`
  )
})

function mockPrResponse(
  owner: string,
  repo: string,
  sha: string,
  prNumber: number,
  body: string = 'PR description'
) {
  return {
    head: {
      repo: {
        full_name: `${owner}/${repo}`,
        html_url: `https://github.com/${owner}/${repo}`
      },
      sha: sha
    },
    html_url: `https://github.com/${owner}/${repo}/pull/${prNumber}`,
    body: body
  }
}

function mockCommentResponse(commentId: number, login: string, body: string) {
  return {
    id: commentId,
    user: {
      login: login
    },
    body: body,
    html_url: `https://github.com/<example>/<example>/issues/0#issuecomment-${commentId}`
  }
}

const mockPrData = {
  data: mockPrResponse('test-owner', 'test-repo', 'test-sha', 0)
}

test('binderEnvironmentUrl default', () => {
  const binderUrl = 'https://binder.test'
  const environmentRepo = null
  expect(
    __private.binderEnvironmentUrl(binderUrl, environmentRepo, mockPrData)
  ).toBe(`${binderUrl}/v2/gh/test-owner/test-repo/test-sha`)
})

test('binderEnvironmentUrl with pullyMcPullface', () => {
  const binderUrl = 'https://binder.test'
  const environmentRepo = 'gh/test/repo/branch'
  expect(
    __private.binderEnvironmentUrl(binderUrl, environmentRepo, mockPrData)
  ).toBe(`${binderUrl}/v2/${environmentRepo}`)
})

test('binderQuery without pullyMcPullface', () => {
  expect(__private.binderQuery(null, mockPrData, null, null)).toBe('')
  expect(
    __private.binderQuery(null, mockPrData, 'lab/tree/example.ipynb', null)
  ).toBe('?urlpath=lab%2Ftree%2Fexample.ipynb')
  expect(__private.binderQuery(null, mockPrData, null, 'extra=a%25b')).toBe(
    '?extra=a%25b'
  )
  expect(
    __private.binderQuery(
      null,
      mockPrData,
      'lab/tree/example.ipynb',
      'extra=a%25b'
    )
  ).toBe('?urlpath=lab%2Ftree%2Fexample.ipynb&extra=a%25b')
})

test('binderQuery environmentRepo', () => {
  const environmentRepo = 'gh/test/repo/branch'
  expect(__private.binderQuery(environmentRepo, mockPrData, null, null)).toBe(
    '?urlpath=git-pull%3Frepo%3Dhttps%253A%252F%252Fgithub.com%252Ftest-owner%252Ftest-repo%26branch%3Dtest-sha'
  )
  expect(
    __private.binderQuery(environmentRepo, mockPrData, 'rstudio', 'extra=a%25b')
  ).toBe(
    '?urlpath=git-pull%3Frepo%3Dhttps%253A%252F%252Fgithub.com%252Ftest-owner%252Ftest-repo%26branch%3Dtest-sha%26urlpath%3Drstudio&extra=a%25b'
  )
})

const mockParams = {
  binderUrl: 'https://mybinder.org',
  token: 'token',
  owner: 'owner',
  repo: 'repo',
  query: null,
  environmentRepo: null,
  urlpath: null,
  updateDescription: false
}

const binderComment1 =
  '[![Binder](https://mybinder.org/badge_logo.svg)](https://mybinder.org/v2/gh/owner/repo/abcdef1) :point_left: Launch a binder notebook on this branch for commit abcdef1'
const fullComment1 = `${binderComment1}\n\nI will automatically update this comment whenever this PR is modified`

const binderComment2 =
  '[![Binder](https://mybinder.org/badge_logo.svg)](https://mybinder.org/v2/gh/owner/repo/9876543) :point_left: Launch a binder notebook on this branch for commit 9876543'
const fullComment2 = `${fullComment1}\n\n${binderComment2}`

test('add new comment', async () => {
  nock('https://api.github.com')
    .get('/repos/owner/repo/pulls/1')
    .reply(200, mockPrResponse('owner', 'repo', 'abcdef1', 1))
  nock('https://api.github.com')
    .get('/repos/owner/repo/issues/1/comments')
    .reply(200, [
      mockCommentResponse(12, 'github-actions[bot]', 'something else'),
      mockCommentResponse(34, 'someone-else', 'something else')
    ])
  nock('https://api.github.com')
    .post('/repos/owner/repo/issues/1/comments', {body: fullComment1})
    .reply(200)

  const c = await addBinderComment({
    ...mockParams,
    prNumber: 1
  })
  expect(c).toBe(binderComment1)
})

test('update existing comment', async () => {
  nock('https://api.github.com')
    .get('/repos/owner/repo/pulls/2')
    .reply(200, mockPrResponse('owner', 'repo', '9876543', 2))
  nock('https://api.github.com')
    .get('/repos/owner/repo/issues/2/comments')
    .reply(200, [
      mockCommentResponse(56, 'github-actions[bot]', fullComment1),
      mockCommentResponse(78, 'someone-else', 'something else')
    ])
  nock('https://api.github.com')
    .patch('/repos/owner/repo/issues/comments/56', {body: fullComment2})
    .reply(200)

  const c = await addBinderComment({
    ...mockParams,
    prNumber: 2
  })
  expect(c).toBe(binderComment2)
})

test('add new lab comment using query', async () => {
  const binderLabComment =
    '[![Binder](https://mybinder.org/badge_logo.svg)](https://mybinder.org/v2/gh/owner/repo/a1b2c3d?urlpath=lab) :point_left: Launch a binder notebook on this branch for commit a1b2c3d'
  const fullLabComment = `${binderLabComment}\n\nI will automatically update this comment whenever this PR is modified`

  nock('https://api.github.com')
    .get('/repos/owner/repo/pulls/3')
    .reply(200, mockPrResponse('owner', 'repo', 'a1b2c3d', 3))
  nock('https://api.github.com')
    .get('/repos/owner/repo/issues/3/comments')
    .reply(200, [mockCommentResponse(90, 'someone-else', 'something else')])
  nock('https://api.github.com')
    .post('/repos/owner/repo/issues/3/comments', {body: fullLabComment})
    .reply(200)

  const c = await addBinderComment({
    ...mockParams,
    prNumber: 3,
    query: 'urlpath=lab'
  })
  expect(c).toBe(binderLabComment)
})

test('add new lab comment using urlpath', async () => {
  const binderLabComment =
    '[![Binder](https://mybinder.org/badge_logo.svg)](https://mybinder.org/v2/gh/owner/repo/a1b2c3d?urlpath=lab) :point_left: Launch a binder notebook on this branch for commit a1b2c3d'
  const fullLabComment = `${binderLabComment}\n\nI will automatically update this comment whenever this PR is modified`

  nock('https://api.github.com')
    .get('/repos/owner/repo/pulls/4')
    .reply(200, mockPrResponse('owner', 'repo', 'a1b2c3d', 4))
  nock('https://api.github.com')
    .get('/repos/owner/repo/issues/4/comments')
    .reply(200, [mockCommentResponse(91, 'someone-else', 'something else')])
  nock('https://api.github.com')
    .post('/repos/owner/repo/issues/4/comments', {body: fullLabComment})
    .reply(200)

  const c = await addBinderComment({
    ...mockParams,
    prNumber: 4,
    urlpath: 'lab'
  })
  expect(c).toBe(binderLabComment)
})

test('add new lab comment with pullyMcPullface', async () => {
  const binderPullQuery =
    '?urlpath=git-pull%3Frepo%3Dhttps%253A%252F%252Fgithub.com%252Fowner%252Frepo%26branch%3Da1b2c3d%26urlpath%3Dlab'
  const binderLabComment = `[![Binder](https://mybinder.org/badge_logo.svg)](https://mybinder.org/v2/gh/envowner/envrepo/branch${binderPullQuery}) :point_left: Launch a binder notebook on this branch for commit a1b2c3d`
  const fullLabComment = `${binderLabComment}\n\nI will automatically update this comment whenever this PR is modified`

  nock('https://api.github.com')
    .get('/repos/owner/repo/pulls/5')
    .reply(200, mockPrResponse('owner', 'repo', 'a1b2c3d', 5))
  nock('https://api.github.com')
    .get('/repos/owner/repo/issues/5/comments')
    .reply(200, [mockCommentResponse(101, 'someone-else', 'something else')])
  nock('https://api.github.com')
    .post('/repos/owner/repo/issues/5/comments', {body: fullLabComment})
    .reply(200)

  const c = await addBinderComment({
    ...mockParams,
    prNumber: 5,
    environmentRepo: 'gh/envowner/envrepo/branch',
    urlpath: 'lab'
  })
  expect(c).toBe(binderLabComment)
})

test('add to pr description', async () => {
  const initialDescription = '# PR\n\ndescription'
  nock('https://api.github.com')
    .get('/repos/owner/repo/pulls/6')
    .reply(
      200,
      mockPrResponse('owner', 'repo', 'abcdef1', 6, initialDescription)
    )
  nock('https://api.github.com')
    .patch('/repos/owner/repo/pulls/6', {
      body: `${initialDescription}\n\n${binderComment1}`
    })
    .reply(200)

  const c = await addBinderComment({
    ...mockParams,
    prNumber: 6,
    updateDescription: true
  })
  expect(c).toBe(binderComment1)
})

test('add another to pr description', async () => {
  const initialDescription = `# PR\n\ndescription\n\n${binderComment1}`
  nock('https://api.github.com')
    .get('/repos/owner/repo/pulls/7')
    .reply(
      200,
      mockPrResponse('owner', 'repo', '9876543', 7, initialDescription)
    )
  nock('https://api.github.com')
    .patch('/repos/owner/repo/pulls/7', {
      body: `${initialDescription}\n\n${binderComment2}`
    })
    .reply(200)

  const c = await addBinderComment({
    ...mockParams,
    prNumber: 7,
    updateDescription: true
  })
  expect(c).toBe(binderComment2)
})
