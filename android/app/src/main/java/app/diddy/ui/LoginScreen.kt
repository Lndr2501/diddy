package app.diddy.ui

import android.annotation.SuppressLint
import android.webkit.JavascriptInterface
import android.webkit.WebView
import androidx.compose.foundation.Image
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.imePadding
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.statusBarsPadding
import androidx.compose.foundation.layout.widthIn
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.BasicTextField
import androidx.compose.foundation.text.KeyboardActions
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.CheckCircle
import androidx.compose.material.icons.filled.Description
import androidx.compose.material.icons.filled.Verified
import androidx.compose.material3.Icon
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.SolidColor
import androidx.compose.ui.platform.LocalUriHandler
import androidx.compose.ui.res.painterResource
import androidx.compose.ui.text.SpanStyle
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.text.buildAnnotatedString
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.ImeAction
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.text.input.PasswordVisualTransformation
import androidx.compose.ui.text.input.VisualTransformation
import androidx.compose.ui.text.withStyle
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.compose.ui.viewinterop.AndroidView
import androidx.compose.ui.window.Dialog
import androidx.compose.ui.window.DialogProperties
import app.diddy.R
import app.diddy.app.AppModel
import app.diddy.matrix.LoginService
import app.diddy.matrix.Registration
import app.diddy.matrix.RegistrationLogic
import app.diddy.ui.theme.Theme
import kotlinx.coroutines.delay
import kotlinx.coroutines.launch

/** Sign in or create an account (ios LoginView.swift). */
@Composable
fun LoginScreen(isAddingAccount: Boolean, onClose: () -> Unit = {}) {
    val login = remember { LoginService() }
    val registration = remember { Registration() }
    val scope = rememberCoroutineScope()
    var creating by remember { mutableStateOf(false) }
    var newUsername by remember { mutableStateOf("") }
    var newPassword by remember { mutableStateOf("") }
    var confirmPassword by remember { mutableStateOf("") }
    var token by remember { mutableStateOf("") }
    var email by remember { mutableStateOf("") }
    var webStep by remember { mutableStateOf<String?>(null) }
    val uri = LocalUriHandler.current

    LaunchedEffect(login.resolvedServer) { registration.reset(login.resolvedServer) }
    LaunchedEffect(registration.step) {
        when (val step = registration.step) {
            is Registration.Step.Web -> if (registration.error == null) webStep = step.url
            is Registration.Step.Done -> {
                val name = RegistrationLogic.localpart(newUsername)
                val result = login.loginAfterRegistration(step.userId, name, newPassword)
                if (result != null) {
                    newPassword = ""
                    confirmPassword = ""
                    AppModel.add(result.first, result.second)
                    if (isAddingAccount) onClose()
                } else {
                    creating = false
                    login.updateUsername(step.userId ?: name)
                }
            }
            else -> {}
        }
    }

    fun finish(result: Pair<app.diddy.matrix.AccountRecord, org.matrix.rustcomponents.sdk.Client>?) {
        if (result == null) return
        scope.launch {
            AppModel.add(result.first, result.second)
            if (isAddingAccount) onClose()
        }
    }

    Box(
        Modifier.fillMaxSize().background(Brush.linearGradient(listOf(Theme.accent.copy(alpha = 0.35f), Theme.rail, Theme.rail))),
    ) {
        Column(
            Modifier.fillMaxSize().statusBarsPadding().imePadding().verticalScroll(rememberScrollState()).padding(24.dp),
            horizontalAlignment = Alignment.CenterHorizontally,
        ) {
            if (isAddingAccount) {
                Row(Modifier.fillMaxWidth()) {
                    TextButton(onClick = { login.reset(); onClose() }) { Text("Cancel", color = Theme.accent) }
                }
            }
            Column(Modifier.widthIn(max = 480.dp).fillMaxWidth(), horizontalAlignment = Alignment.CenterHorizontally) {
                Spacer(Modifier.size(32.dp))
                Image(painterResource(R.drawable.diddy_logo), contentDescription = null, modifier = Modifier.size(88.dp))
                Spacer(Modifier.size(22.dp))
                Text(
                    when {
                        creating -> "Create an Account"
                        isAddingAccount -> "Add an Account"
                        else -> "Welcome to Diddy"
                    },
                    color = Theme.text, fontSize = 28.sp, fontWeight = FontWeight.Bold,
                )
                Spacer(Modifier.size(6.dp))
                Text(
                    when {
                        creating -> "Pick a server, a name and a password. Your account lives on that server."
                        isAddingAccount -> "Sign in on another homeserver. Your current account stays signed in."
                        else -> "Sign in with your Matrix account."
                    },
                    color = Theme.muted, fontSize = 15.sp, textAlign = androidx.compose.ui.text.style.TextAlign.Center,
                )
                Spacer(Modifier.size(22.dp))
                Column(
                    Modifier.fillMaxWidth().clip(RoundedCornerShape(16.dp)).background(Theme.sidebar).padding(20.dp),
                    verticalArrangement = Arrangement.spacedBy(14.dp),
                ) {
                    Field("HOMESERVER") {
                        InputField(
                            value = login.homeserver, onChange = login::updateHomeserver, placeholder = "matrix.org",
                            enabled = login.method == null, keyboardType = KeyboardType.Uri, imeAction = ImeAction.Go,
                            onGo = { if (login.method == null && !login.busy) scope.launch { login.discover() } },
                        )
                    }
                    when (login.method) {
                        null -> FilledButton("Continue", busy = login.busy) { scope.launch { login.discover() } }
                        LoginService.Method.PASSWORD -> {
                            ServerLine(login) { login.reset(); registration.reset(null) }
                            if (creating) {
                                RegistrationForm(
                                    registration, login, newUsername, { newUsername = it }, newPassword, { newPassword = it },
                                    confirmPassword, { confirmPassword = it }, token, { token = it }, email, { email = it },
                                    onOpenWeb = { webStep = it }, onOpenLink = { uri.openUri(it) },
                                )
                            } else {
                                Field("USERNAME") {
                                    InputField(login.username, login::updateUsername, "@you:server", keyboardType = KeyboardType.Email)
                                }
                                Field("PASSWORD") {
                                    InputField(login.password, login::updatePassword, "Password", password = true, imeAction = ImeAction.Go,
                                        onGo = { scope.launch { finish(login.loginWithPassword()) } })
                                }
                                FilledButton("Log In", busy = login.busy) { scope.launch { finish(login.loginWithPassword()) } }
                            }
                        }
                        LoginService.Method.OAUTH -> {
                            ServerLine(login) { login.reset(); registration.reset(null) }
                            Text(
                                if (creating) "This server creates accounts on its own page. Diddy signs you in when you are done."
                                else "This server signs you in on its own page. Diddy never sees your password.",
                                color = Theme.muted, fontSize = 13.sp,
                            )
                            FilledButton(if (creating) "Create Account" else "Continue to Sign In", busy = login.busy) {
                                scope.launch { finish(login.loginWithOAuth(create = creating)) }
                            }
                        }
                    }
                    login.error?.let { Text(it, color = Theme.danger, fontSize = 13.sp) }
                    if (AppModel.restoreErrors.isNotEmpty() && !isAddingAccount) {
                        Text("Some saved logins could not be restored:\n" + AppModel.restoreErrors.joinToString("\n"), color = Theme.faint, fontSize = 12.sp)
                    }
                }
                Spacer(Modifier.size(22.dp))
                Text(
                    buildAnnotatedString {
                        if (creating) {
                            append("Already have an account? ")
                            withStyle(SpanStyle(fontWeight = FontWeight.Bold)) { append("Log in") }
                        } else {
                            append("New here? ")
                            withStyle(SpanStyle(fontWeight = FontWeight.Bold)) { append("Create an account") }
                        }
                    },
                    color = Theme.text, fontSize = 15.sp,
                    modifier = Modifier.clickable(enabled = !login.busy && !registration.busy) {
                        creating = !creating
                        login.error = null
                        registration.reset(login.resolvedServer)
                    }.padding(8.dp),
                )
            }
        }
    }

    webStep?.let { url ->
        RegistrationWebDialog(url) {
            webStep = null
            scope.launch { registration.fallbackDone() }
        }
    }
}

@Composable
private fun RegistrationForm(
    registration: Registration,
    login: LoginService,
    newUsername: String, setUsername: (String) -> Unit,
    newPassword: String, setPassword: (String) -> Unit,
    confirmPassword: String, setConfirm: (String) -> Unit,
    token: String, setToken: (String) -> Unit,
    email: String, setEmail: (String) -> Unit,
    onOpenWeb: (String) -> Unit,
    onOpenLink: (String) -> Unit,
) {
    val scope = rememberCoroutineScope()
    val busy = registration.busy || login.busy
    when (val step = registration.step) {
        is Registration.Step.Form, is Registration.Step.Done -> {
            Field("USERNAME") { InputField(newUsername, setUsername, "name") }
            LaunchedEffect(newUsername) {
                delay(500)
                registration.checkAvailability(newUsername)
            }
            when (val availability = registration.availability) {
                is Registration.Availability.Free -> Row(verticalAlignment = Alignment.CenterVertically) {
                    Icon(Icons.Filled.CheckCircle, null, tint = Theme.online, modifier = Modifier.size(16.dp))
                    Spacer(Modifier.size(6.dp))
                    Text("This username is free.", color = Theme.online, fontSize = 13.sp)
                }
                is Registration.Availability.Problem -> Text(availability.text, color = Theme.danger, fontSize = 13.sp)
                null -> {}
            }
            Field("PASSWORD") { InputField(newPassword, setPassword, "Password", password = true) }
            Field("CONFIRM PASSWORD") { InputField(confirmPassword, setConfirm, "Password again", password = true) }
            if (confirmPassword.isNotEmpty() && confirmPassword != newPassword) {
                Text("The passwords do not match.", color = Theme.danger, fontSize = 13.sp)
            }
            FilledButton("Create Account", busy = busy) {
                if (newPassword != confirmPassword) {
                    registration.error = "The passwords do not match."
                } else scope.launch { registration.start(newUsername, newPassword, LoginService.deviceName) }
            }
        }
        is Registration.Step.Token -> {
            Text("This server needs a registration token. You get it from whoever runs the server.", color = Theme.muted, fontSize = 13.sp)
            Field("REGISTRATION TOKEN") { InputField(token, setToken, "Token") }
            FilledButton("Continue", busy = busy) { scope.launch { registration.submitToken(token) } }
        }
        is Registration.Step.Terms -> {
            Text("Please read and accept the server's terms.", color = Theme.muted, fontSize = 13.sp)
            step.policies.forEach { policy ->
                Row(Modifier.clickable { onOpenLink(policy.url) }.padding(vertical = 4.dp), verticalAlignment = Alignment.CenterVertically) {
                    Icon(Icons.Filled.Description, null, tint = Theme.accent, modifier = Modifier.size(18.dp))
                    Spacer(Modifier.size(8.dp))
                    Text(policy.name, color = Theme.accent, fontSize = 15.sp)
                }
            }
            FilledButton("I Agree", busy = busy) { scope.launch { registration.acceptTerms() } }
        }
        is Registration.Step.Email -> {
            Text("This server confirms new accounts by email.", color = Theme.muted, fontSize = 13.sp)
            Field("EMAIL") { InputField(email, setEmail, "you@example.com", keyboardType = KeyboardType.Email) }
            FilledButton("Send Link", busy = busy) { scope.launch { registration.sendEmail(email) } }
        }
        is Registration.Step.WaitingForEmail -> {
            Text("We sent a link to ${step.address}. Open it, then come back and tap Continue.", color = Theme.muted, fontSize = 13.sp)
            FilledButton("Continue", busy = busy) { scope.launch { registration.confirmEmail() } }
            TextButton(onClick = { scope.launch { registration.sendEmail(step.address) } }) { Text("Send the Email Again", fontSize = 13.sp) }
        }
        is Registration.Step.Web -> {
            Text("The server asks for one more step on its own page.", color = Theme.muted, fontSize = 13.sp)
            FilledButton("Open Page", busy = busy) { onOpenWeb(step.url) }
        }
    }
    registration.error?.let { Text(it, color = Theme.danger, fontSize = 13.sp) }
    if (registration.step != Registration.Step.Form) {
        TextButton(onClick = { registration.reset(login.resolvedServer) }) { Text("Start Over", fontSize = 13.sp) }
    }
}

@Composable
private fun ServerLine(login: LoginService, onChange: () -> Unit) {
    Row(verticalAlignment = Alignment.CenterVertically) {
        Icon(Icons.Filled.Verified, null, tint = Theme.online, modifier = Modifier.size(18.dp))
        Spacer(Modifier.size(6.dp))
        Text(login.resolvedServer ?: login.homeserver, color = Theme.muted, fontSize = 13.sp, maxLines = 1, modifier = Modifier.weight(1f))
        TextButton(onClick = onChange) { Text("Change", fontSize = 13.sp) }
    }
}

@Composable
fun Field(title: String, content: @Composable () -> Unit) {
    Column(verticalArrangement = Arrangement.spacedBy(6.dp)) {
        Text(title, color = Theme.muted, fontSize = 12.sp, fontWeight = FontWeight.Bold)
        Box(Modifier.fillMaxWidth().clip(RoundedCornerShape(8.dp)).background(Theme.rail).padding(12.dp)) { content() }
    }
}

@Composable
fun InputField(
    value: String,
    onChange: (String) -> Unit,
    placeholder: String,
    enabled: Boolean = true,
    password: Boolean = false,
    keyboardType: KeyboardType = KeyboardType.Text,
    imeAction: ImeAction = ImeAction.Next,
    onGo: (() -> Unit)? = null,
    singleLine: Boolean = true,
    modifier: Modifier = Modifier,
) {
    BasicTextField(
        value = value,
        onValueChange = onChange,
        enabled = enabled,
        singleLine = singleLine,
        textStyle = TextStyle(color = if (enabled) Theme.text else Theme.muted, fontSize = 16.sp),
        cursorBrush = SolidColor(Theme.accent),
        visualTransformation = if (password) PasswordVisualTransformation() else VisualTransformation.None,
        keyboardOptions = KeyboardOptions(
            keyboardType = if (password) KeyboardType.Password else keyboardType,
            imeAction = imeAction,
            autoCorrectEnabled = false,
        ),
        keyboardActions = KeyboardActions(onGo = { onGo?.invoke() }, onDone = { onGo?.invoke() }),
        modifier = modifier.fillMaxWidth(),
        decorationBox = { inner ->
            Box {
                if (value.isEmpty()) Text(placeholder, color = Theme.faint, fontSize = 16.sp)
                inner()
            }
        },
    )
}

/**
 * A registration step on the server's own page (reCAPTCHA and steps the app does not know). The
 * page calls `window.onAuthDone()` when it is complete (Matrix spec, fallback auth).
 */
@SuppressLint("SetJavaScriptEnabled")
@Composable
private fun RegistrationWebDialog(url: String, onFinish: () -> Unit) {
    Dialog(onDismissRequest = onFinish, properties = DialogProperties(usePlatformDefaultWidth = false)) {
        Column(Modifier.fillMaxSize().background(Theme.sidebar).statusBarsPadding()) {
            Row(Modifier.fillMaxWidth().padding(8.dp), verticalAlignment = Alignment.CenterVertically) {
                Text(android.net.Uri.parse(url).host ?: "Server", color = Theme.text, fontWeight = FontWeight.SemiBold, modifier = Modifier.weight(1f).padding(start = 8.dp))
                TextButton(onClick = onFinish) { Text("Done") }
            }
            AndroidView(
                factory = { context ->
                    WebView(context).apply {
                        settings.javaScriptEnabled = true
                        settings.domStorageEnabled = true
                        addJavascriptInterface(object {
                            @JavascriptInterface
                            fun done() { post { onFinish() } }
                        }, "diddyAuth")
                        webViewClient = object : android.webkit.WebViewClient() {
                            override fun onPageFinished(view: WebView, url: String?) {
                                view.evaluateJavascript("window.onAuthDone = function () { diddyAuth.done(); };", null)
                            }
                        }
                        loadUrl(url)
                    }
                },
                onRelease = { it.destroy() },
                modifier = Modifier.fillMaxSize(),
            )
        }
    }
}
