import './assets/tachyons.min.css'
import './assets/spinner.css'

import { PProgress } from 'p-progress'

import {
  createIdentity,
  registerIdentity,
  sendVerificationEmail,
  waitIdentityVerification,
  removeIdentity,
  storeIdentity,
  loadDefaultIdentity
} from '@w3ui/keyring-core'

import {
  encodeDirectory,
  encodeFile,
  chunkBlocks,
  uploadCarChunks
} from '@w3ui/uploader-core'

const SELECTORS = {
  authForm: '#sign-up-in-form',
  cancelRegistrationButton: '#cancel-registration',
  signOutButton: '#sign-out',
  verificationTemplate: '#verification-required-template',
  confirmationTemplate: '#registration-success-template',
  uploadConfirmation: '#upload-confirmation',
  uploadProgress: '#upload-started',
  uploadConfirmationGallery: '#upload-confirmation-gallery',
  uploadConfirmButton: '#upload-confirm-button',
  uploadTemplate: '#upload-template',
  progressBar: '#upload-progress',
  uploadLink: '#upload-link',
  emptyStateTemplate: '#empty-state-template',
  genericErrorTemplate: '#generic-error-template'
}

export const EVENTS = {
  registrationStart: 'registration:start',
  registrationSuccess: 'registration:success'
}

export class RegisterForm extends window.HTMLElement {
  constructor () {
    super()
    this.identity = null
    this.email = null
    this.rootCID = null
    this.rootURL = null
    this.uploadData = {}
    this.form$ = document.querySelector(SELECTORS.authForm)
    this.confirmationTemplate$ = document.querySelector(SELECTORS.confirmationTemplate)
    this.verificationTemplate$ = document.querySelector(SELECTORS.verificationTemplate)
    this.emptyStateTemplate$ = document.querySelector(SELECTORS.emptyStateTemplate)
    this.genericErrorTemplate$ = document.querySelector(SELECTORS.genericErrorTemplate)
    this.uploadTemplate$ = document.querySelector(SELECTORS.uploadTemplate)
    this.submitHandler = this.submitHandler.bind(this)
    this.cancelRegistrationHandler = this.cancelRegistrationHandler.bind(this)
    this.signOutHandler = this.signOutHandler.bind(this)
    this.copyLinkHandler = this.copyLinkHandler.bind(this)
    this.formatTemplateContent = this.formatTemplateContent.bind(this)
  }

  async connectedCallback () {
    if (!this.validateURLParams()) {
      return
    }

    // Load the user
    const identity = await loadDefaultIdentity()

    if (identity) {
      this.identity = identity
      this.email = identity.email
      this.toggleConfirmation()
      console.log(`DID: ${identity.signingPrincipal.did()}`)
    } else {
      this.form$.addEventListener('submit', this.submitHandler)

      const thumbnails = document.getElementById('thumbnails')

      for (const imageURL of this.uploadData.imageURLs) {
        const imageElement = document.createElement('img')
        imageElement.setAttribute('src', imageURL)
        imageElement.setAttribute('alt', 'Generated Artwork')
        imageElement.setAttribute('class', 'h3 mr2')
        thumbnails.appendChild(imageElement)
      }
      console.log('No identity registered')
    }
  }

  validateURLParams () {
    const searchParams = new URLSearchParams(window.location.search)

    if (!window.location.search) {
      this.toggleEmptyPage()
      return false
    }

    const images = searchParams.get('images')
    const imageURLs = images ? images.split(',') : null
    const description = searchParams.get('description')
    const parametersString = searchParams.get('params')
    let parsedParameters = null

    try {
      parsedParameters = JSON.parse(parametersString)
    } catch (error) {
      console.error(error)
      this.toggleErrorPage()
      return false
    }

    if (
      (!imageURLs || imageURLs.length < 0) ||
      !description ||
      !parsedParameters
    ) {
      console.error('Invalid query parameters')
      this.toggleErrorPage()
      return false
    }

    this.uploadData.imageURLs = imageURLs
    this.uploadData.description = description
    this.uploadData.parameters = parsedParameters
    return true
  }

  toggleEmptyPage () {
    console.log('togg empty')

    const templateContent = this.emptyStateTemplate$.content
    this.replaceChildren(templateContent)
  }

  toggleErrorPage () {
    console.log('togg err')

    const templateContent = this.genericErrorTemplate$.content
    this.replaceChildren(templateContent)
  }

  formatTemplateContent (templateContent) {
    templateContent.querySelector('[data-email-slot]').innerHTML = this.email
    return templateContent
  }

  toggleConfirmation () {
    const templateContent = this.confirmationTemplate$.content

    const gallery = templateContent.querySelector(SELECTORS.uploadConfirmationGallery)

    for (const imageURL of this.uploadData.imageURLs) {
      const imageElement = document.createElement('img')
      imageElement.setAttribute('src', imageURL)
      imageElement.setAttribute('alt', 'Generated Artwork')
      imageElement.setAttribute('class', 'h3 mr2')
      gallery.appendChild(imageElement)
    }

    const toReplace = this.formatTemplateContent(templateContent)
    toReplace.querySelector('[data-image-number-slot]').innerHTML = this.uploadData.imageURLs.length
    this.replaceChildren(toReplace)

    this.uploadConfirmButton$ = document.querySelector(SELECTORS.uploadConfirmButton)
    this.uploadConfirmButton$.addEventListener('click', () => { this.toggleUploadConfirmation() })

    this.signOutButton$ = document.querySelector(SELECTORS.signOutButton)
    this.signOutButton$.addEventListener('click', this.signOutHandler)
  }

  toggleVerification () {
    const templateContent = this.verificationTemplate$.content
    this.replaceChildren(this.formatTemplateContent(templateContent))
    this.cancelRegistrationButton$ = document.querySelector(SELECTORS.cancelRegistrationButton)
    this.cancelRegistrationButton$.addEventListener('click', this.cancelRegistrationHandler)
  }

  toggleUploadLink (url) {
    const templateContent = this.uploadTemplate$.content
    this.replaceChildren(templateContent)
    const uploadLink$ = this.querySelector(SELECTORS.uploadLink)
    uploadLink$.addEventListener('click', this.copyLinkHandler)
  }

  toggleUploadConfirmation () {
    const uploadConfirmation = document.querySelector(SELECTORS.uploadConfirmation)
    const uploadProgress = document.querySelector(SELECTORS.uploadProgress)

    uploadConfirmation.classList.add('dn')
    uploadProgress.classList.remove('dn')
    this.uploadFiles()
  }

  disconnectedCallback () {
    this.form$?.removeEventListener('submit', this.submitHandler)
  }

  async cancelRegistrationHandler (e) {
    e.preventDefault()
    window.location.reload()
  }

  async copyLinkHandler (e) {
    e.preventDefault()
    await navigator.clipboard.writeText(this.rootURL)
  }

  async signOutHandler (e) {
    e.preventDefault()
    if (this.identity) {
      await removeIdentity(this.identity)
    }
    window.location.reload()
  }

  async submitHandler (e) {
    e.preventDefault()
    const fd = new window.FormData(e.target)
    // log in a user by their email
    const email = fd.get('email')
    this.email = email
    let identity
    let proof

    if (email) {
      const unverifiedIdentity = await createIdentity({ email })
      console.log(`DID: ${unverifiedIdentity.signingPrincipal.did()}`)
      await sendVerificationEmail(unverifiedIdentity)
      const controller = new AbortController()

      try {
        this.toggleVerification(true);
        ({ identity, proof } = await waitIdentityVerification(
          unverifiedIdentity,
          {
            signal: controller.signal
          }
        ))
        await registerIdentity(identity, proof)
        await storeIdentity(identity)
        this.identity = identity
      } catch (err) {
        console.error('Registration failed:', err)
        this.email = null
      } finally {
        this.toggleConfirmation(true)
      }
    }
  }

  renderHTMLContactSheet (imgs, metadata, params, prompt) {
    const getGatewayLink = cid => `https://${cid.toString()}.ipfs.w3s.link/`

    const imgElms = imgs.map((img, index) => {
      return `<a href="${getGatewayLink(img.CID)}"><img src="${getGatewayLink(img.CID)}"/><p>${img.CID}</p></a>`
    }).join('')

    const metadataLink = `<p>Metadata JSON hosted on IPFS: <a href="${getGatewayLink(metadata.CID)}">${metadata.CID}</a></p>`

    let paramList = ''
    for (const [key, value] of Object.entries(params)) {
      paramList += `<dt>${key}</dt><dd>${value}</dd>`
    }

    const html = `
<!DOCTYPE html>
<html>
  <head>
  <meta charset="utf-8">
  <title>Art</title>
  <meta name="twitter:card" content="summary_large_image" />
  <meta name="twitter:title" content="Art">
  <meta name="twitter:description" content="${prompt}">
  <meta name="twitter:image" content="${getGatewayLink(imgs[0].CID)}" />
  <meta property="og:type" content="article" />
  <meta property="og:title" content="Art">
  <meta property="og:description" content="${prompt}" />
  <meta property="og:image" content="${getGatewayLink(imgs[0].CID)}" />
  <style>
    body {
      background-color: #1d2027;
      color: #f4f4f4;
      font-family:-apple-system, BlinkMacSystemFont, 'avenir next', avenir, 'helvetica neue', helvetica, ubuntu, roboto, noto, 'segoe ui', arial, sans-serif;
      line-height: 1.5;
      margin: 24px;
    }

    a {
      color: #f4f4f4;
    }

    dl {
      column-gap: 24px;
      display: grid;
      grid-template-columns: max-content 2fr;
      line-height: 1.5;
    }

    dd {
      margin: 0;
    }

    dt {
      font-weight: bold;
    }

    .images {
      display: grid;
      gap: 24px;
      grid-template-columns: repeat(1, 1fr);
    }

    @media screen and (min-width: 800px) {
      .images {
        grid-template-columns: repeat(2, 1fr);
      }
    }

    .images a {
      display: inline-block;
      font-weight: 100;
      text-decoration: none;
    }

    .metadata-link,
    .images a p::after {
      content: " ⤵";
    }

    .images img {
      width: 100%;
    }
  </style>
  </head>
  <body>
    <div class='images'>${imgElms}</div>
    <div class='metadata'>
      <div>
        <h1 style="font-weight: 900;">Prompt</h1>
        <p>${prompt}</p>
      </div>
      <div>
        <h1 style="font-weight: 900;">Parameters</h1>
        <dl>${paramList}</dl>
      </div>
      <div class="metadata-link">${metadataLink}</div>
    </div>
    <p style="margin-top: 2em; margin-bottom: 1em; font-weight: 100;">Generate your own art with <a href="https://diffusionbee.com/" target="_blank">DiffusionBee</a>! Gallery and image hosted on IPFS with <a href="https://web3.storage/" target="_blank">web3.storage.</a></p>
  </body>
</html>
`
    return html.trim()
  }

  uploadFiles () {
    const {
      imageURLs,
      parameters,
      description
    } = this.uploadData

    if (imageURLs.length > 0) {
      const imageBlobsPromise = Promise.all(
        imageURLs.map(async (url, index) => {
          try {
            const response = await fetch(url)
            const blob = await response.blob()
            const file = new File([blob], `${index}.png`)
            const { cid, blocks } = await encodeFile(file)
            const chunks = await chunkBlocks(blocks)
            await chunks.next() // Need to tap into stream in order to get the CID
            const CID = await cid
            return { file, CID, url }
          } catch {
            return undefined
          }
        })
      )
      const uploadJSONMetadata = async (description, metadata) => {
        const str = JSON.stringify({
          description,
          ...metadata
        })
        const bytes = new TextEncoder().encode(str)
        const blob = new Blob([bytes], {
          type: 'application/json;charset=utf-8'
        })

        const file = new File([blob], 'metadata.json')

        try {
          const { cid, blocks } = await encodeFile(file)
          const chunks = await chunkBlocks(blocks)
          await chunks.next() // Need to tap into stream in order to get the CID
          const CID = await cid
          return { file, CID }
        } catch {
          return undefined
        }
      }

      const upload = async () => {
        const identity = await loadDefaultIdentity()
        const imageBlobs = await imageBlobsPromise
        const metadataBlob = await uploadJSONMetadata(description, parameters)
        const indexHTML = this.renderHTMLContactSheet(imageBlobs, metadataBlob, parameters, description)
        const blob = new Blob([indexHTML], {
          type: 'text/plain;charset=utf-8'
        })
        const indexHTMLBlob = new File([blob], 'index.html')
        const { cid, blocks } = encodeDirectory([indexHTMLBlob, metadataBlob.file, ...imageBlobs.filter(blob => blob).map(blob => blob.file)])
        await chunkBlocks(blocks)
        await uploadCarChunks(identity.signingPrincipal, chunkBlocks(blocks))
        const CID = await cid
        this.rootCID = CID
      }

      const uploadPromiseAll = PProgress.all([imageBlobsPromise, upload()])

      uploadPromiseAll.onProgress((progress) => {
        const progressBarEl = document.querySelector(SELECTORS.progressBar)
        progressBarEl.setAttribute('value', progress * 100)
        progressBarEl.innerText = `${Math.round(progress * 100)}%`
      })

      uploadPromiseAll.then(() => {
        const url = `https://${this.rootCID.toString()}.ipfs.w3s.link`
        this.rootURL = url
        this.toggleUploadLink(url)
        if (window.ipcRenderer) { // electron context
          window.ipcRenderer.sendSync('open_url', url)
        } else {
          window.open(url)
        }
      })
    }
  }
}

window.customElements.define('register-form', RegisterForm)
