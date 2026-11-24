<?php
/**
 * Plugin Name: Redação HG — Campos Meta
 * Description: Regista o campo "subtítulo" na API REST e liga-o ao campo de subtítulo do tema
 *              Jannah/TieLabs ("Título Secundário"), para a Redação HG o preencher via API.
 * Version: 1.0.0
 * Author: Redação HG
 */

if (!defined('ABSPATH')) {
    exit; // sem acesso directo
}

/**
 * Chave do subtítulo usada pelo TEMA. No Jannah (TieLabs) é 'tie_sub_title'.
 * Se o teu tema usar outra chave, muda só esta linha.
 */
if (!defined('RHG_THEME_SUBTITLE_KEY')) {
    define('RHG_THEME_SUBTITLE_KEY', 'tie_sub_title');
}

add_action('init', function () {
    $auth = function () {
        return current_user_can('edit_posts');
    };

    // Campo genérico que a Redação HG envia via REST.
    register_post_meta('post', 'subtitulo', array(
        'type'          => 'string',
        'single'        => true,
        'show_in_rest'  => true,
        'auth_callback' => $auth,
    ));

    // Campo real do tema (para escrita/leitura via REST e para o tema o mostrar).
    register_post_meta('post', RHG_THEME_SUBTITLE_KEY, array(
        'type'          => 'string',
        'single'        => true,
        'show_in_rest'  => true,
        'auth_callback' => $auth,
    ));
});

/**
 * Ao criar/actualizar um post via REST, copia o 'subtitulo' enviado pela Redação HG para o
 * campo de subtítulo do tema, para aparecer no "Título Secundário".
 */
add_action('rest_after_insert_post', function ($post, $request) {
    $params = $request->get_params();

    $sub = '';
    if (isset($params['meta']['subtitulo'])) {
        $sub = $params['meta']['subtitulo'];
    } else {
        $sub = get_post_meta($post->ID, 'subtitulo', true);
    }

    if (!empty($sub)) {
        update_post_meta($post->ID, RHG_THEME_SUBTITLE_KEY, sanitize_text_field($sub));
    }
}, 10, 2);
