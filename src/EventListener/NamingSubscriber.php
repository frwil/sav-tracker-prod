<?php

namespace App\EventListener;

use App\Entity\Building;
use App\Repository\BuildingRepository;
use Doctrine\Bundle\DoctrineBundle\Attribute\AsEntityListener;
use Doctrine\ORM\Events;
use Doctrine\Persistence\Event\LifecycleEventArgs;

#[AsEntityListener(event: Events::prePersist, method: 'prePersist', entity: Building::class)]
class NamingSubscriber
{
    public function __construct(private BuildingRepository $buildingRepository) {}

    public function prePersist(Building $building, LifecycleEventArgs $event): void
    {
        $currentCount = $this->buildingRepository->count([
            'customer' => $building->getCustomer()
        ]);
        $unwanted_array = array(
            'À' => 'A',
            'Á' => 'A',
            'Â' => 'A',
            'Ã' => 'A',
            'Ä' => 'A',
            'Å' => 'A',
            'Æ' => 'AE',
            'Ç' => 'C',
            'È' => 'E',
            'É' => 'E',
            'Ê' => 'E',
            'Ë' => 'E',
            'Ì' => 'I',
            'Í' => 'I',
            'Î' => 'I',
            'Ï' => 'I',
            'Ð' => 'D',
            'Ñ' => 'N',
            'Ò' => 'O',
            'Ó' => 'O',
            'Ô' => 'O',
            'Õ' => 'O',
            'Ö' => 'O',
            'Ø' => 'O',
            'Ù' => 'U',
            'Ú' => 'U',
            'Û' => 'U',
            'Ü' => 'U',
            'Ý' => 'Y',
            'Þ' => 'TH',
            'ß' => 'ss',
            'à' => 'a',
            'á' => 'a',
            'â' => 'a',
            'ã' => 'a',
            'ä' => 'a',
            'å' => 'a',
            'æ' => 'ae',
            'ç' => 'c',
            'è' => 'e',
            'é' => 'e',
            'ê' => 'e',
            'ë' => 'e',
            'ì' => 'i',
            'í' => 'i',
            'î' => 'i',
            'ï' => 'i',
            'ð' => 'd',
            'ñ' => 'n',
            'ò' => 'o',
            'ó' => 'o',
            'ô' => 'o',
            'õ' => 'o',
            'ö' => 'o',
            'ø' => 'o',
            'ù' => 'u',
            'ú' => 'u',
            'û' => 'u',
            'ü' => 'u',
            'ý' => 'y',
            'þ' => 'th',
            'ÿ' => 'y'
        );

        $string = 'BATIMENT ' . substr(strtoupper($building->getCustomer()->getName()), 0, 10) . $building->getCustomer()->getId() ;

        // Remplacement des caractères accentués
        $string = strtr($string, $unwanted_array);

        // Conversion des caractères restants en ASCII
        $string = iconv('UTF-8', 'ASCII//TRANSLIT//IGNORE', $string);

        // Suppression des caractères non alphanumériques (sauf espace et tiret)
        $string = preg_replace('/[^A-Za-z0-9\s-]/', '', $string);

        // Nettoyage des espaces multiples
        $string = preg_replace('/\s+/', ' ', $string);
        $building->setName(trim($string. ' #' . ($currentCount + 1)));
    }
}
