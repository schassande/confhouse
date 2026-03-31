#!/usr/bin/env bash

set -euo pipefail

user=277443
key=ebd89f8342a249d376776aca86790611
version=1
name='Chassande'
firstname='Sebastien'
email='sebastien.chassande-barrioz@cgi.com'
ticket='Sponsor conference'
payment_type='other'
event_id='1397785'

request_suffix="$(date +%s)"
order_request_id="order-${request_suffix}"
product_request_id="product-${request_suffix}"

api_base="https://www.billetweb.fr/api/event/${event_id}"
add_order_url="${api_base}/add_order?user=${user}&key=${key}&version=${version}"
update_product_url="${api_base}/update_product?user=${user}&key=${key}&version=${version}"
attendees_url="${api_base}/attendees?user=${user}&key=${key}&version=${version}"

if [[ -z "${event_id}" ]]; then
  echo "Missing event_id."
  exit 1
fi

#===============#
# Create ticket #
#===============#
payload=$(cat <<JSON
{
  "data": [
    {
      "name": "${name}",
      "firstname": "${firstname}",
      "email": "${email}",
      "request_id": "${order_request_id}",
      "payment_type": "${payment_type}",
      "ship": 1,
      "products": [
        {
          "ticket": "${ticket}",
          "name": "${name}",
          "firstname": "${firstname}",
          "email": "${email}",
          "request_id": "${product_request_id}",
          "custom": {
            "185489": "Normal"
          }
        }
      ]
    }
  ]
}
JSON
)

echo "POST ${add_order_url}"
echo
echo "Payload:"
echo "${payload}"
echo
response="$(
  curl -k -sS \
    -X POST "${add_order_url}" \
    -H "Content-Type: application/json" \
    --data-raw "${payload}"
)"
echo "Add order response:"
echo "${response}"
echo
response="$(
  curl -k -sS \
    -X POST "${update_product_url}" \
    -H "Content-Type: application/json" \
    --data-raw "${payload}"
)"


#====================================#
# Query attendes to check the result #
#====================================#
echo "GET ${attendees_url}"
echo
attendees_response="$(curl -k -sS "${attendees_url}")"
echo "Attendees response:"
echo "${attendees_response}"
