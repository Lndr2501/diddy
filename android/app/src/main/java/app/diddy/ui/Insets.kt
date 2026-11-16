package app.diddy.ui

import androidx.compose.foundation.layout.imePadding
import androidx.compose.foundation.layout.navigationBarsPadding
import androidx.compose.foundation.layout.statusBarsPadding
import androidx.compose.ui.Modifier

fun Modifier.statusBarsPaddingCompat(): Modifier = this.statusBarsPadding()
fun Modifier.navigationBarsPaddingCompat(): Modifier = this.navigationBarsPadding()
fun Modifier.imePaddingCompat(): Modifier = this.imePadding()
