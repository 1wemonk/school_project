import 'whatwg-fetch';

export const putOrder = (orderData) => {
    let url = 'https://stage.e-feed.ru/wp-json/app/v1/create-ticket/?' +
        Object.keys(orderData)
            .map((k) => k + '=' + encodeURIComponent(orderData[k]))
            .join('&');

    return fetch(url, { method: 'post' })
        .then((response) => response.json())
        .then((json) => {
            if (json.status === 200) {
                console.log(json);
            } else {
                console.warn(' error while put ticket', url, orderData, json);
            }
        })
        .catch((ex) => {
            console.error('Ошибка запроса: ' + String(ex));
        });
};

export const trackData = (formData) => {
    const url = 'https://stage.e-feed.ru/wp-json/app/v1/track-data/';

    return fetch(url, { method: 'post', body: formData })
        .then((response) => response.json())
        .then((json) => {
            console.log('track data responce', json);
            if (json.code !== 200) console.warn(' error while track data', url, formData, json);
        })
        .catch((ex) => {
            console.error('Ошибка запроса: ' + String(ex));
        });
};
