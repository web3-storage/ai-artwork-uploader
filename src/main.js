import './assets/tachyons.min.css'
import './assets/spinner.css'

import pProgress, { PProgress } from 'p-progress'

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
	uploadLink: '#upload-link'
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
		this.uploadTemplate$ = document.querySelector(SELECTORS.uploadTemplate)
		this.submitHandler = this.submitHandler.bind(this)
		this.cancelRegistrationHandler = this.cancelRegistrationHandler.bind(this)
		this.signOutHandler = this.signOutHandler.bind(this)
		this.copyLinkHandler = this.copyLinkHandler.bind(this)
		this.formatTemplateContent = this.formatTemplateContent.bind(this)
	}

	async connectedCallback () {

    if (!this.validateURLParams()) {
      return;
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
				var imageElement = document.createElement("img");
				imageElement.setAttribute("src", imageURL);
				imageElement.setAttribute("alt", "Generated Artwork");
				imageElement.setAttribute("class", "h3 mr2");
				thumbnails.appendChild(imageElement);
			}
			console.log('No identity registered')
		}
	}

  validateURLParams () {
    const searchParams = new URLSearchParams(window.location.search)

    if (!window.location.search) {
      this.toggleEmptyPage()
      return false;
    }

    const images = searchParams.get('images')
    const imageURLs = images ? images.split(',') : null
    const description = searchParams.get('description')
		const parametersString = searchParams.get('params')
    let parsedParameters = null

    try {
      parsedParameters = JSON.parse(parametersString);
    } catch (error) {
      console.error(error);
      this.toggleErrorPage()
      return false
    }

    if (
      (!imageURLs || imageURLs.length < 0)
      || !description
      || !parsedParameters
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
  }

  toggleErrorPage () {
    console.log('togg err')

  }

	formatTemplateContent (templateContent) {
		templateContent.querySelector('[data-email-slot]').innerHTML = this.email
		return templateContent
	}

	toggleConfirmation () {
		const templateContent = this.confirmationTemplate$.content

		const gallery = templateContent.querySelector(SELECTORS.uploadConfirmationGallery)

		for (const imageURL of this.uploadData.imageURLs) {
			var imageElement = document.createElement("img");
			imageElement.setAttribute("src", imageURL);
			imageElement.setAttribute("alt", "Generated Artwork");
			imageElement.setAttribute("class", "mr2");
			gallery.appendChild(imageElement);
		}

    const toReplace = this.formatTemplateContent(templateContent)
    toReplace.querySelector('[data-image-number-slot]').innerHTML = this.uploadData.imageURLs.length
		this.replaceChildren(toReplace)

		this.uploadConfirmButton$ = document.querySelector(SELECTORS.uploadConfirmButton)
		this.uploadConfirmButton$.addEventListener('click', () => {this.toggleUploadConfirmation()})

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

		uploadConfirmation.classList.add("dn")
		uploadProgress.classList.remove("dn")
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

	renderHTMLContactSheet (imgs, params, prompt) {
		const imgElms = imgs.map((img, index) => `<a href="${index}.png"><img src="${index}.png"/></a>`).join('')

		let paramList = ''
		for (const [key, value] of Object.entries(params)) {
			paramList += `<dt>${key}</dt><dd>${value}</dd>`
		}

		const promptEl = `<h1>Prompt</h1><p>${prompt}</p>`
		const paramsEl = `<h1>Parameters</h1><dl>${paramList}</dl>`

		const html = `
<!DOCTYPE html>
<html>
	<head>
	<style>
		body {
			font-family:-apple-system, BlinkMacSystemFont,
			'avenir next', avenir,
			'helvetica neue', helvetica,
			ubuntu,
			roboto, noto,
			'segoe ui', arial,
			sans-serif;
			margin: 20px;
			background-color: #f4f4f4;
			color: #111111;
		}

		.images a {
			display: inline-block;
		}

		.images img {
			padding: 12px;
		}
	</style>
	</head>
	<body>
		${promptEl}${paramsEl}<div class='images'>${imgElms}</div>
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

		const indexHTML = this.renderHTMLContactSheet(imageURLs, parameters, description)
		const blob = new Blob([indexHTML], {
			type: 'text/plain;charset=utf-8',
		});
		const indexHTMLBlob = new File([blob], 'index.html')

		if (imageURLs.length > 0) {
			const imageBlobsPromise = PProgress.all(
				imageURLs.map(async (url, index) => {
					try {
						const response = await fetch(url)
						const blob = await response.blob()
						const file = new File([blob], `${index}.png`)
						return file
					} catch {
						return undefined
					}
				})
			)

			const upload = async () => {
				const imageBlobs = await imageBlobsPromise
				const identity = await loadDefaultIdentity()
				const { cid, blocks } = encodeDirectory([indexHTMLBlob, ...imageBlobs.filter(blob => blob)])
				const chunks = await chunkBlocks(blocks)
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
				window.open(url)
			})
		}
	}
}

window.customElements.define('register-form', RegisterForm)
